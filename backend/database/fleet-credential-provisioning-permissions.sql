-- Apply with a database administrator after the v1.1 snapshot.
-- Keep the provisioning principal separate from the API runtime principal.
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.Robots', N'U') IS NULL
    THROW 51000, 'Apply the CampusTour schema before Fleet credential permissions.', 1;

IF DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') IS NULL
    EXEC(N'CREATE ROLE campus_fleet_provisioner AUTHORIZATION dbo;');

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'campus_fleet_provisioner' AND type = 'R')
    THROW 51001, 'campus_fleet_provisioner exists but is not a database role.', 1;

GRANT SELECT (RobotCode) ON OBJECT::dbo.Robots TO campus_fleet_provisioner;
GRANT UPDATE (CredentialHash, FirstAcceptedSyncAt, FirstAcceptedMapKey, FirstAcceptedFrameId)
    ON OBJECT::dbo.Robots TO campus_fleet_provisioner;
GO
