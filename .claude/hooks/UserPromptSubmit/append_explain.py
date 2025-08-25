import json
import sys


def main() -> None:
    try:
        data = json.load(sys.stdin)
        prompt = data.get("prompt", "")
        if prompt.rstrip().endswith("-e"):
            print(
                "\nAbove are the relevant logs. Your job is to:\n"
                " 1. Think harder about the content of the logs.\n"
                " 2. Respond with a short and simpler explanation.\n"
                "DO NOT JUMP TO CONCLUSIONS! DO NOT MAKE ASSUMPTIONS!\n"
                "CONSIDER OUR PROJECT, HOW IT WORKS, AND HOW THE DATA IS SUPPOSED TO FLOW.\n\n"
                "Finally, after you’ve explained the logs to me, suggest what the best next step is.\n"
            )
            sys.exit(0)
    except Exception as e:  # pragma: no cover
        print(f"append_explain error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
