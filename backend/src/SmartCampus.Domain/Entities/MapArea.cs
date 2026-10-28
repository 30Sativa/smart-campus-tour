using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class MapArea
{
    public string AreaKey { get; set; } = null!;

    public string DisplayName { get; set; } = null!;

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual ICollection<MapVersion> MapVersions { get; set; } = new List<MapVersion>();
}
