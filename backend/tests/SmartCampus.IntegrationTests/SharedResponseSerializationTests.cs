using System.Text.Json;
using SmartCampus.Api.Common.Responses;

namespace SmartCampus.IntegrationTests;

public sealed class SharedResponseSerializationTests
{
    [Fact]
    public void PagedResponse_SerializesSharedPropertiesInContractOrder()
    {
        var response = new PagedResponse<string>
        {
            Success = true,
            Message = "Accounts retrieved.",
            Data = ["account-1"],
            Pagination = new PaginationMetadata(1, 20, 1, 1),
            Errors = null
        };

        var json = JsonSerializer.Serialize(
            response,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        using var document = JsonDocument.Parse(json);
        var properties = document.RootElement
            .EnumerateObject()
            .Select(property => property.Name)
            .ToArray();

        Assert.Equal(
            ["success", "message", "data", "pagination", "errors"],
            properties);
    }
}
