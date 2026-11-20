# Changelog

## [1.3.2](https://github.com/1solomonwakhungu/gronify/compare/v1.3.1...v1.3.2) (2026-11-13)


### Bug Fixes

* **cli:** indent flatten --pretty by path depth, not by the whole line ([#142](https://github.com/1solomonwakhungu/gronify/issues/142)) ([2e98b68](https://github.com/1solomonwakhungu/gronify/commit/2e98b6868b99b69637bbf4c219d8de002d0caf29))

## [1.3.1](https://github.com/1solomonwakhungu/gronify/compare/v1.3.0...v1.3.1) (2026-11-05)


### Performance Improvements

* **cli:** faster streaming unflatten via reused frames and borrowed keys ([#129](https://github.com/1solomonwakhungu/gronify/issues/129)) ([dd3530d](https://github.com/1solomonwakhungu/gronify/commit/dd3530dbcf3883600650a743e371dda17bc64418))
* **cli:** speed up flatten and search with byte-level tokenizer paths ([#127](https://github.com/1solomonwakhungu/gronify/issues/127)) ([ae3254d](https://github.com/1solomonwakhungu/gronify/commit/ae3254d0a8b916ca4518413f04ac210515ee63f9))

## [1.3.0](https://github.com/1solomonwakhungu/gronify/compare/v1.2.0...v1.3.0) (2026-11-04)


### Features

* **cli:** add cross-tool benchmark against gron, fastgron, jq and jaq ([#104](https://github.com/1solomonwakhungu/gronify/issues/104)) ([6719604](https://github.com/1solomonwakhungu/gronify/commit/6719604fbe15512673b2cca692163ded271af4b6))


### Bug Fixes

* **cli:** treat disconnected stdout sockets as quiet pipe closes ([#113](https://github.com/1solomonwakhungu/gronify/issues/113)) ([4fb66b0](https://github.com/1solomonwakhungu/gronify/commit/4fb66b065cc04ea6d29527fc8c594baa0324519a))


### Performance Improvements

* **cli:** accelerate long literal searches and trim output scratch space ([#110](https://github.com/1solomonwakhungu/gronify/issues/110)) ([90a9734](https://github.com/1solomonwakhungu/gronify/commit/90a9734e97abad9bac51cf81bacffe99b9f5d54f))
* **cli:** recover record-stream RSS with bounded literal validation ([#119](https://github.com/1solomonwakhungu/gronify/issues/119)) ([dbaba00](https://github.com/1solomonwakhungu/gronify/commit/dbaba0045c19e0065640ebb0d651cfe5386dd625))
* reduce streaming flatten token and copy overhead ([#111](https://github.com/1solomonwakhungu/gronify/issues/111)) ([f76ec80](https://github.com/1solomonwakhungu/gronify/commit/f76ec803079f2d5b222cd2aae30d2470ffe24cd5))
* reuse unflatten paths and avoid compact indentation allocations ([#112](https://github.com/1solomonwakhungu/gronify/issues/112)) ([98262d1](https://github.com/1solomonwakhungu/gronify/commit/98262d18451e14cbd0143c34b97adcfd8131e938))

## [1.2.0](https://github.com/1solomonwakhungu/gronify/compare/v1.1.0...v1.2.0) (2026-10-31)


### Features

* **cli:** add result caps, --sort, and --exit-status for agents ([#98](https://github.com/1solomonwakhungu/gronify/issues/98)) ([e6af8bf](https://github.com/1solomonwakhungu/gronify/commit/e6af8bf9fc8031e1dbc4eb39d9d978ef82b1dc09))
* **cli:** stream flatten and search for multi-GB inputs ([#95](https://github.com/1solomonwakhungu/gronify/issues/95)) ([e3ac1a1](https://github.com/1solomonwakhungu/gronify/commit/e3ac1a126ee7b1c40f44d2f9ae3ee6603440f031))
* **cli:** stream unflatten for multi-GB gron input ([#94](https://github.com/1solomonwakhungu/gronify/issues/94)) ([a8e21bd](https://github.com/1solomonwakhungu/gronify/commit/a8e21bd2c2a083ba7370b985cdde56e1f31cd9b2))

## [1.1.0](https://github.com/1solomonwakhungu/gronify/compare/v1.0.0...v1.1.0) (2026-10-17)


### Features

* **cli:** add --output, search --invert-match, and error tips ([#44](https://github.com/1solomonwakhungu/gronify/issues/44)) ([fb3d363](https://github.com/1solomonwakhungu/gronify/commit/fb3d36353b9092eb951a89d29c8ccb5d217d3706))


### Bug Fixes

* **ci:** clear new audit advisories blocking CI ([#73](https://github.com/1solomonwakhungu/gronify/issues/73)) ([5842485](https://github.com/1solomonwakhungu/gronify/commit/584248543588331a5abacc21c64ad7d3d82268e6))
