using System;
using System.Collections.Generic;
using System.Text;

namespace SmartCampus.Application.Common.Models
{
    public sealed record PagedResult<T>(IReadOnlyCollection<T> Items, int Page, int PageSize, long TotalItems)
    {
        public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(TotalItems / (double)PageSize);
    }
}
