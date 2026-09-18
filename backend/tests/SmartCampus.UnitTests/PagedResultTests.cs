using SmartCampus.Application.Common.Models;

namespace SmartCampus.UnitTests;

public sealed class PagedResultTests
{
    [Theory]
    [InlineData(0, 20, 0)]
    [InlineData(20, 20, 1)]
    [InlineData(21, 20, 2)]
    public void TotalPages_RoundsUpFromTotalItems(
        long totalItems,
        int pageSize,
        int expectedTotalPages)
    {
        var result = new PagedResult<int>([], 1, pageSize, totalItems);

        Assert.Equal(expectedTotalPages, result.TotalPages);
    }
}
