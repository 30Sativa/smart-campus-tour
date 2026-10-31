namespace SmartCampus.Domain.Entities;

public partial class Robot
{
    /// <summary>IsDispatchEnabled is not this: registration leaves it false and nothing sets it true.</summary>
    public bool IsDeactivated => DeactivatedAt is not null;
}
