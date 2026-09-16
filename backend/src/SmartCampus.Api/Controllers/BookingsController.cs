using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Application.Bookings;
using SmartCampus.Application.Bookings.DTOs;
using System.Security.Claims;

namespace SmartCampus.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class BookingsController : ControllerBase
    {
        private readonly IBookingService _bookingService;

        public BookingsController(IBookingService bookingService)
        {
            _bookingService = bookingService;
        }

        private Guid GetUserId() =>
            Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        /// <summary>POST /api/bookings — Tạo booking mới</summary>
        [HttpPost]
        public async Task<IActionResult> CreateBooking([FromBody] CreateBookingRequest request)
        {
            try
            {
                var booking = await _bookingService.CreateBookingAsync(GetUserId(), request);
                return CreatedAtAction(nameof(GetBooking), new { id = booking.Id }, booking);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>GET /api/bookings/me — Lịch sử booking của user hiện tại</summary>
        [HttpGet("me")]
        public async Task<IActionResult> GetMyBookings()
        {
            var bookings = await _bookingService.GetMyBookingsAsync(GetUserId());
            return Ok(bookings);
        }

        /// <summary>GET /api/bookings/{id} — Chi tiết một booking</summary>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetBooking(Guid id)
        {
            var booking = await _bookingService.GetBookingByIdAsync(id, GetUserId());
            if (booking == null) return NotFound(new { message = "Booking không tồn tại." });
            return Ok(booking);
        }

        /// <summary>PUT /api/bookings/{id}/cancel — Hủy booking</summary>
        [HttpPut("{id:guid}/cancel")]
        public async Task<IActionResult> CancelBooking(Guid id)
        {
            try
            {
                var booking = await _bookingService.CancelBookingAsync(id, GetUserId());
                return Ok(booking);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>POST /api/bookings/{id}/feedback — Gửi feedback sau tour</summary>
        [HttpPost("{id:guid}/feedback")]
        public async Task<IActionResult> SubmitFeedback(Guid id, [FromBody] FeedbackRequest request)
        {
            try
            {
                await _bookingService.SubmitFeedbackAsync(id, GetUserId(), request);
                return NoContent();
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }
}
