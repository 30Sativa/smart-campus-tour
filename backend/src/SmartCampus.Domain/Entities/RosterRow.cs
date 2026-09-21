using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class RosterRow
{
    public Guid Id { get; set; }

    public Guid RegistrationId { get; set; }

    public int RowNumber { get; set; }

    public string FullName { get; set; } = null!;

    public string? ClassName { get; set; }

    public string NormalizedFullName { get; set; } = null!;

    public string? NormalizedClassName { get; set; }

    public virtual GroupRegistration Registration { get; set; } = null!;
}
