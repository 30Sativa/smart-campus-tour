from glob import glob
from setuptools import find_packages, setup

setup(
    name='gazebo_preview_bridge', version='0.1.0', packages=find_packages(),
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/gazebo_preview_bridge']),
        ('share/gazebo_preview_bridge', ['package.xml']),
        ('share/gazebo_preview_bridge/config', glob('config/*.yaml')),
        ('share/gazebo_preview_bridge/launch', glob('launch/*.launch.py')),
    ],
    install_requires=['setuptools'], tests_require=['pytest'],
    entry_points={'console_scripts': [
        'gazebo_telemetry = gazebo_preview_bridge.gazebo_telemetry:main',
    ]},
)
