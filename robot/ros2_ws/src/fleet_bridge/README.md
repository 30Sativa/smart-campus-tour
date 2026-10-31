# `fleet_bridge`

Telemetry-only ROS 2 Humble package for the Fleet Sync v1 HTTPS endpoint. It
reads the latest `map -> base_footprint` TF and reports execution status as
`UNKNOWN`. HTTPS is sent by a single background worker; callbacks do not
perform network I/O. The package does not create an ActionClient, a publisher,
or any navigation/velocity command path.

See [the deployment and test guide](../../../docs/fleet-bridge.md) before
running this package. Its launch file starts only this node and does not alter
the native Nav2, localization or DDS configuration. Its launch namespace
defaults to `robot_01`; confirm the namespace with read-only graph inspection
and override `robot_namespace` if the surveyed graph uses another name.
