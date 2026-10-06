using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration;

public sealed class GetRepresentativeRegistrationQueryHandler(IRepresentativeRepository repository)
    : IRequestHandler<GetRepresentativeRegistrationQuery, RegistrationDetails>
{
    public async Task<RegistrationDetails> Handle(GetRepresentativeRegistrationQuery query, CancellationToken ct)
    {
        var registration = await repository.GetRegistrationAsync(query.Id, query.Owner, ct)
            ?? throw new NotFoundException("Không tìm thấy dữ liệu.");
        return RepresentativeResponseMapper.Registration(registration);
    }
}
