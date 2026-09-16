using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Bookings;
using SmartCampus.Application.Bookings.DTOs;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Bookings
{
    public class BookingService : IBookingService
    {
        private readonly ApplicationDbContext _context;

        public BookingService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<BookingDto> CreateBookingAsync(Guid userId, CreateBookingRequest request)
        {
            // Load slot with current bookings
            var slot = await _context.TimeSlots
                .Include(s => s.Route)
                .Include(s => s.Bookings)
                .FirstOrDefaultAsync(s => s.Id == request.SlotId)
                ?? throw new KeyNotFoundException("Time slot không tồn tại.");

            if (slot.Status != SlotStatus.Open)
                throw new InvalidOperationException("Time slot này đã đóng.");

            if (slot.StartTime <= DateTime.UtcNow)
                throw new InvalidOperationException("Time slot đã qua.");

            if (slot.IsFull)
                throw new InvalidOperationException("Time slot đã hết chỗ.");

            // FR-BOOK-004: Prevent duplicate active booking for same slot
            var existing = await _context.Bookings.AnyAsync(b =>
                b.UserId == userId && b.SlotId == request.SlotId &&
                (b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed));

            if (existing)
                throw new InvalidOperationException("Bạn đã đặt tour cho khung giờ này rồi.");

            var booking = new Booking
            {
                UserId = userId,
                SlotId = request.SlotId,
                Notes = request.Notes,
                Status = BookingStatus.Confirmed
            };

            _context.Bookings.Add(booking);

            // Create a linked TourSession
            var session = new TourSession
            {
                BookingId = booking.Id,
                Status = SessionStatus.Scheduled
            };
            _context.TourSessions.Add(session);

            await _context.SaveChangesAsync();

            return await GetBookingDtoAsync(booking.Id);
        }

        public async Task<List<BookingDto>> GetMyBookingsAsync(Guid userId)
        {
            return await _context.Bookings
                .Include(b => b.Slot).ThenInclude(s => s!.Route)
                .Where(b => b.UserId == userId)
                .OrderByDescending(b => b.CreatedAt)
                .Select(b => ToDto(b))
                .ToListAsync();
        }

        public async Task<BookingDto?> GetBookingByIdAsync(Guid bookingId, Guid userId)
        {
            var booking = await _context.Bookings
                .Include(b => b.Slot).ThenInclude(s => s!.Route)
                .Include(b => b.User)
                .FirstOrDefaultAsync(b => b.Id == bookingId && b.UserId == userId);

            return booking == null ? null : ToDto(booking);
        }

        public async Task<BookingDto> CancelBookingAsync(Guid bookingId, Guid userId)
        {
            var booking = await _context.Bookings
                .Include(b => b.Slot).ThenInclude(s => s!.Route)
                .FirstOrDefaultAsync(b => b.Id == bookingId && b.UserId == userId)
                ?? throw new KeyNotFoundException("Booking không tồn tại.");

            if (booking.Status == BookingStatus.Cancelled)
                throw new InvalidOperationException("Booking đã bị hủy rồi.");

            if (booking.Status == BookingStatus.Completed)
                throw new InvalidOperationException("Không thể hủy tour đã hoàn thành.");

            booking.Status = BookingStatus.Cancelled;
            booking.CancelledAt = DateTime.UtcNow;

            // Also cancel the linked session
            var session = await _context.TourSessions
                .FirstOrDefaultAsync(s => s.BookingId == bookingId);
            if (session != null)
                session.Status = SessionStatus.Cancelled;

            await _context.SaveChangesAsync();
            return ToDto(booking);
        }

        public async Task SubmitFeedbackAsync(Guid bookingId, Guid userId, FeedbackRequest request)
        {
            var booking = await _context.Bookings
                .FirstOrDefaultAsync(b => b.Id == bookingId && b.UserId == userId)
                ?? throw new KeyNotFoundException("Booking không tồn tại.");

            if (booking.Status != BookingStatus.Completed)
                throw new InvalidOperationException("Chỉ có thể gửi feedback cho tour đã hoàn thành.");

            booking.FeedbackRating = request.Rating;
            booking.FeedbackComment = request.Comment;
            await _context.SaveChangesAsync();
        }

        private async Task<BookingDto> GetBookingDtoAsync(Guid bookingId)
        {
            var booking = await _context.Bookings
                .Include(b => b.Slot).ThenInclude(s => s!.Route)
                .Include(b => b.User)
                .FirstAsync(b => b.Id == bookingId);
            return ToDto(booking);
        }

        private static BookingDto ToDto(Booking b) => new()
        {
            Id = b.Id,
            UserId = b.UserId,
            Username = b.User?.Username ?? string.Empty,
            SlotId = b.SlotId,
            SlotStartTime = b.Slot?.StartTime ?? default,
            SlotEndTime = b.Slot?.EndTime ?? default,
            RouteName = b.Slot?.Route?.Name ?? string.Empty,
            Status = b.Status.ToString(),
            Notes = b.Notes,
            CreatedAt = b.CreatedAt,
            CancelledAt = b.CancelledAt,
            FeedbackRating = b.FeedbackRating
        };
    }
}
