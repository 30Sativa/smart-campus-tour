using FluentValidation;

namespace SmartCampus.Application.Features.MapPoi;

public static class PoiProposalRowVersion
{
    public static byte[] Decode(string value)
    {
        try
        {
            var bytes = Convert.FromBase64String(value);
            if (bytes.Length != 8) throw new FormatException();
            return bytes;
        }
        catch (FormatException)
        {
            throw new ValidationException("ExpectedRowVersion must be a base64 SQL rowversion.");
        }
    }
}
