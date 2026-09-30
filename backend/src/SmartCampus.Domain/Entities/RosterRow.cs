using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class RosterRow
{
    public Guid Id { get; set; }

    public Guid RegistrationId { get; set; }

    public int RowNumber { get; set; }

    public string RowType { get; set; } = null!;

    public string DisplayName { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string? ClassName { get; set; }

    public bool IsActive { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual Invitation? Invitation { get; set; }

    public virtual GroupRegistration Registration { get; set; } = null!;
}
