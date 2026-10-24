using System;
using System.Collections.Generic;
using System.Text;

namespace SmartCampus.Application.Common.Abstractions.Persistence
{
    /// <summary>
    /// Commit-only boundary backed by the same scoped context as feature repositories.
    /// The UnitOfWork pipeline saves successful commands once; queries never resolve this boundary.
    /// Feature transaction behaviors own transaction commit/rollback around that save.
    /// </summary>
    public interface IApplicationDbContext
    {
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    }
}
