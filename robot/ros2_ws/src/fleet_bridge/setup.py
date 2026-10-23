import os
from glob import glob

from setuptools import find_packages, setup

package_name = 'fleet_bridge'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
         [os.path.join('resource', package_name)]),
        (os.path.join('share', package_name), ['package.xml', 'README.md']),
        (os.path.join('share', package_name, 'launch'),
         glob(os.path.join('launch', '*.launch.py'))),
        (os.path.join('share', package_name, 'config'),
         glob(os.path.join('config', '*.yaml'))),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Duy',
    maintainer_email='caoduy856@gmail.com',
    description='Telemetry-only ROS 2 to Backend Fleet Sync v1 bridge.',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'fleet_bridge = fleet_bridge.node:main',
        ],
    },
)
