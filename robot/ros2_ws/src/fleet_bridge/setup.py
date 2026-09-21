from glob import glob
from setuptools import find_packages, setup

setup(
    name='fleet_bridge', version='0.1.0', packages=find_packages(),
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/fleet_bridge']),
        ('share/fleet_bridge', ['package.xml']),
        ('share/fleet_bridge/config', glob('config/*.yaml')),
        ('share/fleet_bridge/launch', glob('launch/*.launch.py')),
    ],
    install_requires=['setuptools'], tests_require=['pytest'],
    entry_points={'console_scripts': [
        'gazebo_telemetry = fleet_bridge.gazebo_telemetry:main',
    ]},
)
