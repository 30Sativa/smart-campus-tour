"""Accuracy regression: current projection/ROI path vs the frozen pre-patch path.

Both paths run on the same deterministic Astra-like scene (fusion_scene.py):
organized 640x480 depth cloud, separate colour K/D, non-identity depth->colour
TF and base_link mount. No sampling is involved: every in-front point is still
projected, so results must match up to floating-point rounding.
"""
import sys
import types
import unittest
from unittest import mock

import numpy as np

import fusion_scene as S
from fusion_scene import P

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

# Same algorithm and float64 arithmetic in OpenCV's operation order. Observed
# difference is 0.0 with OpenCV 4.5.4/numpy 1.26.4 and OpenCV 5.0/numpy 2.x;
# 1e-9 px only absorbs a compiler contracting multiply-add differently.
UV_ATOL_PX = 1e-9
# 1 um: three orders below Astra depth quantization/noise (mm at 1 m, cm at 4 m).
XYZ_ATOL_M = 1e-6
STRONG_BARREL_D = (-0.38, 0.17, 0.002, -0.001, -0.04)


def _fuse(locate, scene):
    """Run one _locate implementation and record every range_core outcome."""
    calls = []
    real = P.range_core

    def recording(*args, **kwargs):
        try:
            rng, mask, core = real(*args, **kwargs)
        except P.PerceptionError as exc:
            calls.append(('error', str(exc)))
            raise
        calls.append((rng, int(mask.sum()), int(core.sum())))
        return rng, mask, core

    with mock.patch.object(P, 'range_core', recording):
        try:
            return locate(S.FusionHarness(), scene.snapshot, scene.boxes), None, calls
        except P.PerceptionError as exc:
            return None, str(exc), calls


def _visible_surface(person):
    """Nearest cylinder surface point seen from the camera, in base_link x/y."""
    centre, camera = np.asarray(person), S.T_BASE_COLOR[:2]
    return centre - S.PERSON_RADIUS * (centre - camera) / np.linalg.norm(centre - camera)


def _thin_person(points, label, keep, seed, spread_m=0.0):
    """Leave a deterministic random subset of person 0; optionally spread its depth."""
    rng = np.random.default_rng(seed)
    person = np.flatnonzero((label == 0).ravel())
    flat = points.reshape(-1, 3)
    drop = person[rng.random(person.size) >= keep]
    flat[drop] = np.nan
    if spread_m:
        kept = person[np.isfinite(flat[person]).all(axis=1)]
        z = flat[kept, 2:3]
        flat[kept] *= (z + rng.uniform(0, spread_m, (kept.size, 1))) / z


@unittest.skipUnless(HAS_CV2, 'legacy reference needs OpenCV')
class FusionAccuracyRegressionTests(unittest.TestCase):
    def assertSameFusion(self, scene):
        old, old_error, old_calls = _fuse(S.FusionHarness.legacy_locate, scene)
        new, new_error, new_calls = _fuse(S.FusionHarness._locate, scene)
        self.assertEqual(new_error, old_error)
        # range_core sees the same ROI/core point sets: identical counts, same range.
        self.assertEqual(len(new_calls), len(old_calls))
        for new_call, old_call in zip(new_calls, old_calls):
            self.assertEqual(new_call[1:], old_call[1:])
            if old_call[0] == 'error':
                self.assertEqual(new_call[0], 'error')
            else:
                self.assertAlmostEqual(new_call[0], old_call[0], delta=XYZ_ATOL_M)
        if old_error is None:
            self.assertEqual(len(new), len(old))
            np.testing.assert_allclose(np.reshape(new, (-1, 3)), np.reshape(old, (-1, 3)),
                                       rtol=0, atol=XYZ_ATOL_M)
        return new, new_error, new_calls

    def assertNearTruth(self, xyz, person, tol_m=0.06):
        """Sanity, not a spec: x forward, y left, z up; within a few cm of the surface."""
        x, y, z = xyz
        np.testing.assert_allclose([x, y], _visible_surface(person), rtol=0, atol=tol_m)
        self.assertGreater(x, 0)
        if abs(person[1]) > 0.3:
            self.assertEqual(np.sign(y), np.sign(person[1]))
        self.assertTrue(0.2 < z < S.PERSON_HEIGHT, z)

    def test_near_centre_bbox(self):
        scene = S.make_scene([(2.0, 0.05)])
        people, _, calls = self.assertSameFusion(scene)
        self.assertEqual(len(people), 1)
        self.assertGreater(calls[0][1], 1000)
        self.assertNearTruth(people[0], scene.people[0])

    def test_left_and_right_bboxes_keep_sign_and_axis(self):
        for person in ((2.6, 0.9), (2.6, -0.9)):
            with self.subTest(person=person):
                scene = S.make_scene([person])
                centre_u = scene.boxes[0, [0, 2]].mean()
                # left in base_link (+y) is left in the image (small u).
                self.assertEqual(centre_u < S.WIDTH / 2, person[1] > 0)
                people, _, _ = self.assertSameFusion(scene)
                self.assertNearTruth(people[0], person)

    def test_multiple_bboxes_preserve_order(self):
        scene = S.make_scene([(1.7, 0.6), (3.1, -0.75), (4.6, 0.15)])
        people, _, calls = self.assertSameFusion(scene)
        self.assertEqual(len(people), 3)
        for xyz, person in zip(people, scene.people):
            self.assertNearTruth(xyz, person)
        self.assertEqual(len(calls), 3)

    def test_near_and_far_person_and_small_roi(self):
        for person, min_roi in (((0.95, -0.25), 10000), ((6.0, 0.4), 1000)):
            with self.subTest(person=person):
                scene = S.make_scene([person])
                people, _, calls = self.assertSameFusion(scene)
                self.assertGreater(calls[0][1], min_roi)
                self.assertNearTruth(people[0], person)
        # The far box is small: about 50x200 px before the 0.5 shrink.
        far = S.make_scene([(6.0, 0.4)]).boxes[0]
        self.assertLess(far[2] - far[0], 60)

    def test_invalid_nan_inf_and_zero_points(self):
        def corrupt(points, _label):
            rng = np.random.default_rng(7)
            flat = points.reshape(-1, 3)
            flat[rng.random(len(flat)) < 0.35] = np.nan
            flat[rng.random(len(flat)) < 0.01, 0] = np.inf
            flat[rng.random(len(flat)) < 0.01] = 0.0
        scene = S.make_scene([(2.2, 0.45), (3.4, -0.6)], edit=corrupt)
        people, _, _ = self.assertSameFusion(scene)
        self.assertEqual(len(people), 2)
        for xyz, person in zip(people, scene.people):
            self.assertNearTruth(xyz, person)

    def test_empty_bbox_list(self):
        scene = S.make_scene([(2.0, 0.0)], boxes=np.empty((0, 4)))
        people, _, calls = self.assertSameFusion(scene)
        self.assertEqual(people, [])
        self.assertEqual(calls, [])

    def test_sparse_roi_success_insufficient_roi_and_insufficient_core(self):
        cases = (
            ('sparse but valid', {'keep': 0.008, 'seed': 1}, None),
            ('insufficient ROI', {'keep': 0.001, 'seed': 2}, 'ROI has insufficient projected depth'),
            # >= 20 ROI points spread over 6 m: fewer than 10 within p25 +/- 0.4 m.
            ('insufficient core', {'keep': 0.005, 'seed': 3, 'spread_m': 6.0}, 'depth core has insufficient points'),
        )
        for name, thin, expected in cases:
            with self.subTest(name=name):
                scene = S.make_scene([(3.0, 0.0)], edit=lambda pts, lab, t=thin: _thin_person(pts, lab, **t))
                people, error, calls = self.assertSameFusion(scene)
                self.assertEqual(error, expected)
                if expected is None:
                    self.assertLess(calls[0][1], 200)
                    self.assertGreaterEqual(calls[0][1], 20)
                    self.assertNearTruth(people[0], (3.0, 0.0), tol_m=0.1)

    def test_bbox_without_depth_outside_image_and_failing_second_box(self):
        def hole(points, _label):
            points[300:430, 70:230] = np.nan
        scene = S.make_scene([(2.6, -0.9)], edit=hole)
        cases = (
            ('no depth', [[110, 320, 190, 400]], 'ROI has insufficient projected depth'),
            ('partly outside image', [[-60, -40, 120, 260]], None),
            ('fully outside image', [[700, 500, 800, 600]], 'ROI has insufficient projected depth'),
            ('second box fails', [scene.boxes[0], [110, 320, 190, 400]], 'ROI has insufficient projected depth'),
        )
        for name, boxes, expected in cases:
            with self.subTest(name=name):
                scene.boxes = np.asarray(boxes, np.float32)
                _, error, _ = self.assertSameFusion(scene)
                self.assertEqual(error, expected)

    def test_unorganized_cloud_matches_organized(self):
        people = [(2.2, 0.45), (3.4, -0.6)]
        organized = S.make_scene(people)
        unorganized = S.make_scene(people, organized=False)
        self.assertEqual(unorganized.snapshot.cloud.height, 1)
        a, _, _ = self.assertSameFusion(organized)
        b, _, _ = self.assertSameFusion(unorganized)
        np.testing.assert_allclose(b, a, rtol=0, atol=XYZ_ATOL_M)

    def test_calibration_variants(self):
        cases = (
            ('plumb_bob zero D', S.COLOR_K, (0., 0., 0., 0., 0.), 'plumb_bob'),
            ('pinhole empty model', S.COLOR_K, (0., 0., 0., 0., 0.), ''),
            ('strong barrel', S.COLOR_K, STRONG_BARREL_D, 'plumb_bob'),
            ('four coefficients', S.COLOR_K, (0.12, -0.25, 0.0012, -0.0008), 'plumb_bob'),
            ('skewed K', (585.0, 1.5, 322.4, 0., 583.0, 236.8, 0., 0., 1.), S.COLOR_D, 'plumb_bob'),
            ('8 coefficients via OpenCV', S.COLOR_K, (0.12, -0.25, 0.0012, -0.0008, 0.09, 0.01, 0.0, 0.0), 'plumb_bob'),
        )
        for name, k, d, model in cases:
            with self.subTest(name=name):
                scene = S.make_scene([(2.6, 0.9), (3.4, -0.6)], k=k, d=d, model=model)
                people, error, _ = self.assertSameFusion(scene)
                self.assertIsNone(error)
                for xyz, person in zip(people, scene.people):
                    self.assertNearTruth(xyz, person)

    def test_full_cloud_projection_matches_legacy_without_opencv(self):
        scene = S.make_scene([(2.2, 0.45), (3.4, -0.6)])
        cam = P.cloud_xyz(scene.snapshot.cloud) @ S.R_COLOR_DEPTH.T + S.T_COLOR_DEPTH
        cam = cam[cam[:, 2] > 0.05]
        self.assertGreater(len(cam), 250000)
        legacy = S.legacy_project_points(cam, S.COLOR_K, S.COLOR_D)
        blocked = types.SimpleNamespace(projectPoints=mock.Mock(side_effect=AssertionError('OpenCV called')))
        with mock.patch.dict(sys.modules, {'cv2': blocked}):
            current = P.project_points(cam, S.COLOR_K, S.COLOR_D)
            people = S.FusionHarness()._locate(scene.snapshot, scene.boxes)
        blocked.projectPoints.assert_not_called()
        np.testing.assert_allclose(current, legacy, rtol=0, atol=UV_ATOL_PX)
        self.assertEqual(len(people), 2)


@unittest.skipUnless(HAS_CV2, 'OpenCV unavailable in host environment')
class ProjectPointsTests(unittest.TestCase):
    @staticmethod
    def opencv(points, k, d):
        uv, _ = cv2.projectPoints(np.asarray(points, np.float64).reshape(-1, 1, 3), np.zeros(3), np.zeros(3),
                                  np.asarray(k, np.float64).reshape(3, 3), np.asarray(d, np.float64))
        return uv.reshape(-1, 2)

    def test_supported_plumb_bob_matches_opencv(self):
        rng = np.random.default_rng(11)
        points = np.c_[rng.uniform(-3, 3, 20000), rng.uniform(-2, 2, 20000), rng.uniform(0.06, 8, 20000)]
        intrinsics = (S.COLOR_K, (585.0, 1.5, 322.4, 0., 583.0, 236.8, 0., 0., 1.),
                      (300., 0., 160., 0., 310., 120., 0.3, -0.2, 1.))  # OpenCV ignores skew/last row
        distortions = ((), (0., 0., 0., 0.), (0., 0., 0., 0., 0.), S.COLOR_D, STRONG_BARREL_D,
                       (0.3, 0.1, 0., 0., 0.02), (0., 0., 0.004, -0.003, 0.), (0.12, -0.25, 0.0012, -0.0008))
        for k in intrinsics:
            for d in distortions:
                with self.subTest(k=k, d=d):
                    np.testing.assert_allclose(P.project_points(points, k, d), self.opencv(points, k, d),
                                               rtol=0, atol=UV_ATOL_PX)

    def test_zero_negative_nan_depth_and_float32_input_match_opencv(self):
        points = np.array([[0.4, -0.2, 0.0], [0.4, -0.2, -2.0], [np.nan, 0.1, 1.0], [0.1, 0.2, np.nan],
                           [0.1, 0.2, 1e-9], [0.5, 0.3, 2.0]])
        np.testing.assert_allclose(P.project_points(points, S.COLOR_K, S.COLOR_D),
                                   self.opencv(points, S.COLOR_K, S.COLOR_D), rtol=0, atol=UV_ATOL_PX)
        f32 = points[[0, 1, 4, 5]].astype(np.float32)
        np.testing.assert_allclose(P.project_points(f32, S.COLOR_K, S.COLOR_D),
                                   S.legacy_project_points(f32, S.COLOR_K, S.COLOR_D), rtol=0, atol=UV_ATOL_PX)

    def test_other_distortion_lengths_keep_opencv_behavior(self):
        points = np.array([[0.5, 0.2, 2.0], [-0.3, 0.1, 1.5]])
        rational = (0.12, -0.25, 0.0012, -0.0008, 0.09, 0.01, 0.002, 0.0)
        with mock.patch.object(cv2, 'projectPoints', wraps=cv2.projectPoints) as project:
            np.testing.assert_array_equal(P.project_points(points, S.COLOR_K, rational),
                                          self.opencv(points, S.COLOR_K, rational))
            self.assertEqual(project.call_count, 2)
        with self.assertRaises(cv2.error):
            P.project_points(points, S.COLOR_K, (0.1, 0.2, 0.3))
        with self.assertRaises(cv2.error):
            S.legacy_project_points(points, S.COLOR_K, (0.1, 0.2, 0.3))


if __name__ == '__main__':
    unittest.main()
