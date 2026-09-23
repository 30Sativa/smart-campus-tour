from glob import glob
import os

from setuptools import setup


package_name = 'robot_navigation'

setup(
    name=package_name,
    version='0.1.0',
    packages=[],
    data_files=[
        ('share/ament_index/resource_index/packages',
         [os.path.join('resource', package_name)]),
        (os.path.join('share', package_name), ['package.xml', 'README.md']),
        (os.path.join('share', package_name, 'launch'),
         glob(os.path.join('launch', '*.launch.py'))),
        (os.path.join('share', package_name, 'config'),
         glob(os.path.join('config', '*.yaml'))),
        (os.path.join('share', package_name, 'rviz'),
         glob(os.path.join('rviz', '*.rviz'))),
        (os.path.join('share', package_name, 'maps'),
         glob(os.path.join('maps', '*.yaml')) + glob(os.path.join('maps', '*.pgm'))),
        # bt_navigator resolves these through
        # $(find-pkg-share robot_navigation)/behavior_trees/... in
        # robot_control/config/nav2_params.yaml, so they must be installed.
        (os.path.join('share', package_name, 'behavior_trees'),
         glob(os.path.join('behavior_trees', '*.xml'))),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Duy',
    maintainer_email='caoduy856@gmail.com',
    description='Localization (map_server + AMCL) and navigation on a saved map.',
    license='Apache-2.0',
    tests_require=['pytest'],
)
