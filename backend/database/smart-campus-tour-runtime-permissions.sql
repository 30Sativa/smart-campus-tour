-- Business permissions for the implemented backend use cases; apply after the log role script.
-- Fleet Sync may stamp one accepted connection per credential rotation; branch writers remain deferred.
-- v1.14 (ADR-0042/0043): Tour runtime claims and releases robots and records command progress; a command's robot,
-- Tour, leg, kind and target are written once at INSERT and never updated, and commands are never deleted.
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Users TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.UserRoles TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.RefreshTokens TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Pois TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.GroupRegistrations TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.RosterRows TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Invitations TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.BrowserSessions TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.RosterEmailChangeRequests TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Routes TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.RouteStops TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Tours TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.TourRobotReservations TO campus_tour_app;
GRANT UPDATE (ReleasedAt, ReleasedByUserId) ON OBJECT::dbo.TourRobotReservations TO campus_tour_app;
-- v1.16: Admin schedule blocks are removed by stamping RemovedAt/RemovedByUserId, never deleted.
GRANT SELECT, INSERT ON OBJECT::dbo.TourScheduleBlocks TO campus_tour_app;
GRANT UPDATE (RemovedAt, RemovedByUserId) ON OBJECT::dbo.TourScheduleBlocks TO campus_tour_app;
-- v1.20 (ADR-0051): Staff discard a never-passed POI proposal by stamping DiscardedAt/DiscardedByUserId; never deleted.
GRANT UPDATE (DiscardedAt, DiscardedByUserId) ON OBJECT::dbo.PoiProposals TO campus_tour_app;
-- v1.23 (ADR-0062): Staff retire or reactivate a POI by stamping or clearing RetiredAt/RetiredByUserId; never deleted.
GRANT UPDATE (RetiredAt, RetiredByUserId) ON OBJECT::dbo.PoiProposals TO campus_tour_app;
-- v1.21 (ADR-0041): Technical Staff retire or reopen a map version by stamping or clearing three columns; never deleted.
GRANT UPDATE (RetiredAt, RetiredByUserId, RetirementReason) ON OBJECT::dbo.MapVersions TO campus_tour_app;
-- v1.22 (ADR-0060): Staff write POI narration drafts in place and approve or discard them by state; never deleted.
-- The proposal, number, author and creation time are written once at INSERT. Request receipts are append-only.
GRANT SELECT, INSERT ON OBJECT::dbo.PoiNarrationRevisions TO campus_tour_app;
GRANT UPDATE (NarrationText, FallbackVideoUrl, State, LastEditedByUserId, LastEditedAt, ApprovedByUserId, ApprovedAt)
    ON OBJECT::dbo.PoiNarrationRevisions TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.PoiNarrationRequestReceipts TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.PoiImportReceipts TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.RouteVariants TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.Robots TO campus_tour_app;
GRANT UPDATE (CredentialHash, CredentialIssuedAt, CredentialIssuedByUserId, CredentialHint,
    CredentialRevokedAt, CredentialRevokedByUserId, FirstAcceptedSyncAt, FirstAcceptedMapKey,
    FirstAcceptedFrameId, AssignedMapVersionId, MapAssignedAt, MapAssignedByUserId, AssignedAreaKey,
    DeactivatedAt, DeactivatedByUserId, DeactivationReason,
    CurrentTourId, LastAssignedAt, NeedsInspection, IsDispatchEnabled) ON OBJECT::dbo.Robots TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.RobotCommands TO campus_tour_app;
GRANT UPDATE (State, IsOpen, Outcome, DeliveredAt, DeliveredStreamId, AcceptedAt, CompletedAt, ReasonCode,
    ResolvedByUserId, ResolvedAt, ResolutionNote) ON OBJECT::dbo.RobotCommands TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.TourAllowedBranches TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.BranchRequests TO campus_tour_app;
GO
