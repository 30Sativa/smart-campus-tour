using System;
using System.Collections.Generic;
using System.Text;

namespace SmartCampus.Application.Common.Abstractions.Persistence
{
    public interface IApplicationDbContext
    {
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    }
}
