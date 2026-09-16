using SmartCampus.Application.Bookings.DTOs;

namespace SmartCampus.Application.Bookings
{
    public interface IBookingService
    {
        Task<BookingDto> CreateBookingAsync(Guid userId, CreateBookingRequest request);
        Task<List<BookingDto>> GetMyBookingsAsync(Guid userId);
        Task<BookingDto?> GetBookingByIdAsync(Guid bookingId, Guid userId);
        Task<BookingDto> CancelBookingAsync(Guid bookingId, Guid userId);
        Task SubmitFeedbackAsync(Guid bookingId, Guid userId, FeedbackRequest request);
    }
}
