# CampusTour DT-AMR

Monorepo for the remote campus-tour system: web experience and staff console,
backend, AI assistant, Digital Twin emulator, and ROS 2/STM32 robot software.

Start with the [documentation guide](docs/README.md) for reading order,
requirements, architecture, decisions, and deploy-unit documentation. Read the
root [AGENTS.md](AGENTS.md) and the relevant deploy unit's `AGENTS.md` before
making code changes.

The code and SQL schema describe current implementation. The Review 1
requirements describe target behavior and label group decisions, pending review,
and future scope separately. A documented target does not mean the feature is
implemented.

Run the repo verification dispatcher with `scripts/verify` from a Bash-capable
shell; see the root `AGENTS.md` for individual targets and verification limits.
