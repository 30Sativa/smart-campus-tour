-- Business permissions for the implemented backend use cases; apply after the log role script.
-- Tours are prepared/cancelled, never hard-deleted. Runtime/branch/robot writers remain deferred.
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Users TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.UserRoles TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.RefreshTokens TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Pois TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.GroupRegistrations TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.RosterRows TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Invitations TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.BrowserSessions TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Routes TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.RouteStops TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Tours TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.RouteVariants TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.Robots TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.TourAllowedBranches TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.BranchRequests TO campus_tour_app;
GO
