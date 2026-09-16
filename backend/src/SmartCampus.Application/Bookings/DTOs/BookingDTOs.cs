using System.ComponentModel.DataAnnotations;

namespace SmartCampus.Application.Bookings.DTOs
{
    public class CreateBookingRequest
    {
        [Required]
        public Guid SlotId { get; set; }
        public string? Notes { get; set; }
    }

    public class BookingDto
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public Guid SlotId { get; set; }
        public DateTime SlotStartTime { get; set; }
        public DateTime SlotEndTime { get; set; }
        public string RouteName { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? CancelledAt { get; set; }
        public int? FeedbackRating { get; set; }
    }

    public class FeedbackRequest
    {
        [Required, Range(1, 5)]
        public int Rating { get; set; }
        public string? Comment { get; set; }
    }
}
