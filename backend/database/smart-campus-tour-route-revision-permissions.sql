-- Apply only after schema v1.3 and the existing campus_tour_app role are installed.
GRANT SELECT, INSERT ON OBJECT::dbo.RouteRevisions TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.RouteRevisionStops TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.RouteRevisionSubmissions TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.RouteTestRuns TO campus_tour_app;
DENY UPDATE, DELETE ON OBJECT::dbo.RouteRevisions TO campus_tour_app;
DENY UPDATE, DELETE ON OBJECT::dbo.RouteRevisionStops TO campus_tour_app;
DENY UPDATE, DELETE ON OBJECT::dbo.RouteRevisionSubmissions TO campus_tour_app;
DENY UPDATE, DELETE ON OBJECT::dbo.RouteTestRuns TO campus_tour_app;
GO
