"""V3 params with the 26/08-23/09 sonar configuration put back (the "before" case).

Usage: legacy_params.py V3.yaml OUT.yaml
local_costmap.plugins gets "sonar_layer" before "inflation_layer" and
sonar_layer.enabled true, exactly as commit 4cf5aa9f had it (topics, ALL,
clear_on_max_reading, no_readings_timeout 2.0, mark/clear thresholds, phi);
nothing else changes. Used only by the offline sim to reproduce the old failures.
"""
import sys
import yaml

src, out = sys.argv[1], sys.argv[2]
d = yaml.safe_load(open(src))
lc = d['local_costmap']['local_costmap']['ros__parameters']
assert 'sonar_layer' not in lc['plugins'] and 'sonar_layer' in lc, 'unexpected V3 layout'
lc['plugins'] = [p for p in lc['plugins'] if p != 'inflation_layer'] + ['sonar_layer', 'inflation_layer']
lc['sonar_layer']['enabled'] = True
yaml.safe_dump(d, open(out, 'w'), sort_keys=False)
print(out, lc['plugins'])
