-- Least privilege for the versioned map/POI workflow (ADR-0021).
-- Apply to the intended runtime role after the v1.2 schema is installed.
-- Immutable map/revision/submission/check/result rows are append-only.
GRANT SELECT, INSERT ON OBJECT::dbo.MapAreas TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.MapVersions TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.MapDeploymentChecks TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.PoiProposalRevisions TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.PoiProposalSubmissions TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.PoiVerificationRecords TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.PoiProposals TO campus_tour_app;
GRANT UPDATE (CurrentRevision, UpdatedAt) ON OBJECT::dbo.PoiProposals TO campus_tour_app;
GO
