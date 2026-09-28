"""Check CAD conversion, point ordering and downward sonar axes."""

import math
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET


PACKAGE = Path(__file__).resolve().parents[1]
XACRO = '{http://www.ros.org/wiki/xacro}'
CAD_CM = {
    'sonar1_link': (101.32, 117.40, 202.70),  # Point2, front-left
    'sonar2_link': (47.65, 117.43, 202.69),  # Point3, front-right
    'sonar3_link': (101.33, 117.43, 125.00),  # Point5, rear-left
    'sonar4_link': (47.65, 117.40, 125.00),  # Point4, rear-right
}


class SensorMountTest(unittest.TestCase):
    def test_cad_positions_and_downward_beams(self):
        root = ET.parse(PACKAGE / 'urdf/sensors.xacro').getroot()
        pitch = float(root.find(
            f"{XACRO}property[@name='sonar_mount_pitch']").attrib['value'])
        self.assertAlmostEqual(math.radians(4), pitch, places=12)
        macro = root.find(f"{XACRO}macro[@name='sr04t_link']")
        origin = macro.find('joint/origin')
        self.assertEqual('${x} ${y} ${z}', origin.attrib['xyz'])
        self.assertEqual('0 ${sonar_mount_pitch} ${yaw}', origin.attrib['rpy'])
        mounts = list(root.iter(f'{XACRO}sr04t_link'))
        self.assertEqual(set(CAD_CM), {m.attrib['name'] for m in mounts})
        for mount in mounts:
            name = mount.attrib['name']
            cad_x, cad_y, cad_z = CAD_CM[name]
            expected = (cad_z / 100 - 1.638492310,
                        cad_x / 100 - 0.744854355,
                        cad_y / 100 - 1.164497711)
            xyz = tuple(float(mount.attrib[a]) for a in ('x', 'y', 'z'))
            for actual, value in zip(xyz, expected):
                self.assertAlmostEqual(value, actual, places=9)
            yaw = float(mount.attrib['yaw'])
            beam = (math.cos(yaw) * math.cos(pitch),
                    math.sin(yaw) * math.cos(pitch), -math.sin(pitch))
            self.assertLess(beam[2], 0)
            self.assertGreater(beam[0] * xyz[0], 0)
            self.assertGreater(beam[1] * xyz[1], 0)
            self.assertAlmostEqual(4, math.degrees(math.atan2(
                -beam[2], math.hypot(beam[0], beam[1]))), places=9)
            for variant in ('sim', 'hw'):
                expanded = ET.parse(
                    PACKAGE / f'urdf/robot_expanded_{variant}.urdf').getroot()
                saved = expanded.find(f"joint[@name='{name}_joint']/origin")
                for actual, value in zip(map(float, saved.attrib['xyz'].split()), xyz):
                    self.assertAlmostEqual(actual, value, places=9)
                angles = list(map(float, saved.attrib['rpy'].split()))
                self.assertEqual(0, angles[0])
                self.assertAlmostEqual(pitch, angles[1], places=12)
                self.assertAlmostEqual(yaw, angles[2], places=12)


if __name__ == '__main__':
    unittest.main()
