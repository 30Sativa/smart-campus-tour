"""The robot's discovery server profile keeps every socket on loopback.

`fastdds discovery -l 127.0.0.1` alone still binds 0.0.0.0 (measured); only the
UDP whitelist with builtin transports off restricts it. SERVER protocol and the
server-0 prefix are required or robot clients never find it (also measured: with
-x and no discoveryProtocol the CLI starts a SIMPLE participant)."""
import os
import xml.etree.ElementTree as ET

PROFILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'config',
                       'fastdds', 'discovery_server_loopback.xml')
NS = {'f': 'http://www.eprosima.com/XMLSchemas/fastRTPS_Profiles'}


def root():
    return ET.parse(PROFILE).getroot()


def test_udp_transport_is_whitelisted_to_loopback_only():
    [t] = root().findall('.//f:transport_descriptor', NS)
    assert t.find('f:type', NS).text == 'UDPv4'
    assert [a.text for a in t.findall('f:interfaceWhiteList/f:address', NS)] == ['127.0.0.1']


def test_server_uses_only_that_transport():
    rtps = root().find('.//f:participant/f:rtps', NS)
    builtin = rtps.find('f:useBuiltinTransports', NS).text
    assert builtin == 'false', 'builtin UDP binds 0.0.0.0'
    used = [u.text for u in rtps.findall('f:userTransports/f:transport_id', NS)]
    assert used == ['udp_loopback']


def test_server_identity_and_locator():
    rtps = root().find('.//f:participant/f:rtps', NS)
    assert rtps.find('f:prefix', NS).text == '44.53.00.5f.45.50.52.4f.53.49.4d.41'
    assert rtps.find('f:builtin/f:discovery_config/f:discoveryProtocol', NS).text == 'SERVER'
    [loc] = rtps.findall('f:builtin/f:metatrafficUnicastLocatorList/f:locator/f:udpv4', NS)
    assert (loc.find('f:address', NS).text, loc.find('f:port', NS).text) == ('127.0.0.1', '11811')
    assert root().find('.//f:participant', NS).get('is_default_profile') == 'true'
