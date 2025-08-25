import json
import sys


def main() -> None:
    try:
        data = json.load(sys.stdin)
        prompt = data.get("prompt", "")
        if prompt.rstrip().endswith("-d"):
            print("\nThink harder and keep your answer short and simple.")
            sys.exit(0)
    except Exception as e:  # pragma: no cover
        print(f"append_digest error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
