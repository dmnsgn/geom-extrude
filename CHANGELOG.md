# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [2.0.1](https://github.com/dmnsgn/geom-extrude/compare/v2.0.0...v2.0.1) (2026-10-14)

### Bug Fixes

* keep forced closed two-point loops open ([70deab9](https://github.com/dmnsgn/geom-extrude/commit/70deab99aa0ad94059a683c574bdbe706c431213))

# [2.0.0](https://github.com/dmnsgn/geom-extrude/compare/v1.0.0...v2.0.0) (2026-10-14)

### Bug Fixes

* keep plain array type for copied vertex attributes ([fc4263b](https://github.com/dmnsgn/geom-extrude/commit/fc4263b408a23a090566d2a834be2a3eaa34de8c))

### Features

* add closed option to geomExtrude and computeProfile ([d10aee3](https://github.com/dmnsgn/geom-extrude/commit/d10aee384b44ef72dc044b488c78578aa61740e9))
* add wallSegments option and export stitchRings ([0624457](https://github.com/dmnsgn/geom-extrude/commit/0624457f5e590fce1e74f5ea24f88e5601d56f4f))
* copy per-vertex shape attributes to caps and walls ([8695a33](https://github.com/dmnsgn/geom-extrude/commit/8695a331bf12152bc98b8e0854e64dcce3ab3fad))
* export computeProfile ([912f76b](https://github.com/dmnsgn/geom-extrude/commit/912f76b4a86cd2d5bf19e0e3eb879511853b1891))

### Performance Improvements

* share wall vertices between smooth edges and export computeColumns ([7410ade](https://github.com/dmnsgn/geom-extrude/commit/7410adef7ec4c5db34d83efa4fd82916b45fc43b))

### BREAKING CHANGES

* PolylineComplex cells are only closed when ending on their first index or position. Pass `closed: true` for the previous behaviour.
* wall vertices are shared between smooth edges, changing their count and order.

# 1.0.0 (2026-10-08)
