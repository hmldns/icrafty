import argparse
import uvicorn
from .http import create_app


def main():
    parser = argparse.ArgumentParser(description="Local Crafty Codex ACP API")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    app = create_app(base_url=f"http://127.0.0.1:{args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
