using System;
using System.Collections.Generic;
using System.Text;

namespace SmartCampus.Application.Common.Abstractions.Persistence
{
    /// <summary>
    /// Unit-of-work boundary backed by the same scoped context as feature repositories.
    /// Handlers may flush within an active transaction to read database-generated values;
    /// the pipeline performs the final save and feature behaviors own transaction commit.
    /// Queries never resolve this boundary.
    /// </summary>
    public interface IApplicationDbContext
    {
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    }
}
