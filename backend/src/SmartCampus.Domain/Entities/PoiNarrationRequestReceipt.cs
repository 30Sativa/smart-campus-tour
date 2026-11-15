using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class PoiNarrationRequestReceipt
{
    public Guid Id { get; set; }

    public Guid ActorUserId { get; set; }

    public Guid RequestId { get; set; }

    public byte[] RequestHash { get; set; } = null!;

    public string Operation { get; set; } = null!;

    public Guid NarrationRevisionId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual User ActorUser { get; set; } = null!;

    public virtual PoiNarrationRevision NarrationRevision { get; set; } = null!;
}
