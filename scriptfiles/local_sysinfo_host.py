#!/usr/bin/env python3
import sys
import json
import subprocess
import socket


def read_msg():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) == 0:
        return None
    msg_len = int.from_bytes(raw_len, byteorder="little")
    data = sys.stdin.buffer.read(msg_len)
    if not data:
        return None
    return json.loads(data)


def send_msg(msg):
    encoded = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(len(encoded).to_bytes(4, byteorder="little"))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def run_cmd(cmd):
    try:
        result = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.STDOUT)
        return result.strip()
    except Exception:
        return "error"


def get_ip_and_hostname():
    hostname = socket.gethostname()
    try:
        ip_addr = socket.gethostbyname(hostname)
    except Exception:
        ip_addr = "Unavailable"
    return hostname, ip_addr


#def handle_get_battery():
#    battery = run_cmd("acpi -b")
#    send_msg({"battery": battery})

def handle_get_battery():
    """
    Returns:
      {
        "battery": "<raw acpi -b output or 'error'>",
        "adapter_raw": "<raw acpi -a output or 'error'>",
        "percent": 78,           # int or None
        "charging": True|False|None  # True = adapter on-line, False = off-line, None = unknown/unavailable
      }
    """
    raw_batt = run_cmd("acpi -b")
    raw_adapter = run_cmd("acpi -a")

    percent = None
    charging = None

    try:
        # parse percent from acpi -b output (first non-empty line)
        if raw_batt and raw_batt != "error":
            lines = [l.strip() for l in raw_batt.splitlines() if l.strip()]
            if lines:
                import re
                m = re.search(r"(\d+)%", lines[0])
                if m:
                    percent = int(m.group(1))

        # parse adapter status from acpi -a robustly
        if raw_adapter and raw_adapter != "error":
            ad_lines = [l.strip() for l in raw_adapter.splitlines() if l.strip()]
            if ad_lines:
                # choose the first adapter line (usually Adapter 0: ...)
                first = ad_lines[0].lower()
                # normalize spaces/hyphens
                # match "on-line", "on line", "online"
                if re.search(r"\bon[\s-]?line\b", first):
                    charging = True
                # match "off-line", "off line", "offline"
                elif re.search(r"\boff[\s-]?line\b", first):
                    charging = False
                else:
                    # Some systems may say "on" or "off" — also check those as fallback
                    if "on" in first and "line" not in first and "off" not in first:
                        charging = True
                    elif "off" in first and "line" not in first:
                        charging = False
                    else:
                        charging = None
    except Exception:
        # parsing error -> keep None
        charging = None

    send_msg({
        "battery": raw_batt,
        "adapter_raw": raw_adapter,
        "percent": percent,
        "charging": charging
    })



def handle_get_wifi_password():
    wifi_pass = run_cmd("nmcli device wifi show-password")
    send_msg({"wifi_password": wifi_pass})


def handle_get_device_info():
    hostname, ip_addr = get_ip_and_hostname()
    send_msg({"hostname": hostname, "ip": ip_addr})


def handle_check_internet():
    try:
        subprocess.check_output(
            ["ping", "-c", "1", "8.8.8.8"],
            text=True,
            stderr=subprocess.STDOUT
        )
        send_msg({"status": "ok", "message": "Internet: OK"})
    except subprocess.CalledProcessError:
        send_msg({"status": "error", "message": "No response from Internet"})


def handle_check_dns(domain=None):
    if not domain:
        domain = "google.com"

    try:
        result = subprocess.check_output(
            ["dig", domain, "+short"],
            text=True,
            stderr=subprocess.STDOUT
        )
        out_str = result.strip()
        if out_str:
            send_msg({
                "status": "ok",
                "message": f"DNS resolving OK for {domain}",
                "output": out_str
            })
        else:
            send_msg({
                "status": "error",
                "message": f"DNS issue detected for {domain}",
                "output": out_str
            })
    except Exception:
        # Fallback to nslookup
        try:
            result = subprocess.check_output(
                ["nslookup", domain],
                text=True,
                stderr=subprocess.STDOUT
            )
            out_str = result.strip()
            if "Address:" in out_str:
                send_msg({
                    "status": "ok",
                    "message": f"DNS resolving OK for {domain} (nslookup)",
                    "output": out_str
                })
            else:
                send_msg({
                    "status": "error",
                    "message": f"DNS issue detected for {domain} (nslookup)",
                    "output": out_str
                })
        except Exception as e:
            send_msg({
                "status": "error",
                "message": f"DNS tool error for {domain}",
                "output": str(e)
            })


def handle_check_public_ip():
    ip = run_cmd("curl -s https://api.ipify.org")
    if ip == "error" or not ip:
        send_msg({"status": "error", "message": "Unable to fetch public IP"})
    else:
        send_msg({"status": "ok", "ip": ip})


def main():
    while True:
        message = read_msg()
        if message is None:
            break

        action = message.get("action")

        if action == "get_battery":
            handle_get_battery()

        elif action == "get_wifi_password":
            handle_get_wifi_password()

        elif action == "get_device_info":
            handle_get_device_info()

        elif action == "check_internet":
            handle_check_internet()

        elif action == "check_dns":
            handle_check_dns()

        elif action == "check_dns_domain":
            domain = message.get("domain")
            handle_check_dns(domain)

        elif action == "check_public_ip":
            handle_check_public_ip()

        else:
            send_msg({"error": f"Unknown action: {action}"})


if __name__ == "__main__":
    main()

