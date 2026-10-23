.PHONY: build demo capture test video clean
build:
	npm run build
demo:
	npm run demo
capture:
	npm run capture
test:
	npm test
	python3 demo/validate-capture.py
video:
	npm run video
clean:
	node -e "require('fs').rmSync('dist', { recursive: true, force: true })"
