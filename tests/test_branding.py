import struct
import unittest
import server


class BrandingTests(unittest.TestCase):
    def test_logo_assets_are_pngs_with_expected_dimensions(self):
        for filename, dimensions in [('echo-logo.png', (512, 512)),
                                     ('echo-wordmark.png', (384, 240)),
                                     ('echo-icon.png', (180, 180)),
                                     ('favicon.png', (64, 64))]:
            route = '/assets/' + filename
            raw = (server.ROOT / server.PUBLIC_ASSETS[route]).read_bytes()
            self.assertEqual(raw[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack('>II', raw[16:24]), dimensions)

    def test_accessible_brand_and_explicit_static_allowlist(self):
        html = (server.ROOT / 'index.html').read_text()
        self.assertIn('aria-label="Echo home"', html)
        self.assertIn('src="/assets/echo-wordmark.png" alt="Echo"', html)
        self.assertIn('href="/assets/favicon.png"', html)
        self.assertIn('href="/assets/echo-icon.png"', html)
        for route in ['/assets/../server.py', '/assets/private.png', '/.env', '/budget.py']:
            self.assertNotIn(route, server.PUBLIC_ASSETS)


if __name__ == '__main__': unittest.main()
