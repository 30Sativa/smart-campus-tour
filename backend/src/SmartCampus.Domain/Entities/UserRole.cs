using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class UserRole
{
    public Guid UserId { get; set; }

    public string Role { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
