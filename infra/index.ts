import * as digitalocean from "@pulumi/digitalocean";
import * as pulumi from "@pulumi/pulumi";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function sshKeyFingerprint(publicKey: string): string {
  const base64 = publicKey.split(/\s+/)[1];
  if (!base64) throw new Error("invalid SSH public key format");
  const hex = createHash("md5").update(Buffer.from(base64, "base64")).digest("hex");
  return hex.match(/.{2}/g)!.join(":");
}

const cfg = new pulumi.Config();

const region = cfg.get("region") ?? "nyc3";
const size = cfg.get("size") ?? "s-1vcpu-2gb";
const image = cfg.get("image") ?? "ubuntu-24-04-x64";
const dropletName = cfg.get("dropletName") ?? "demerzel-bot";
const projectName = cfg.get("projectName") ?? "demerzel-discord-bot";
const enableBackups = cfg.getBoolean("enableBackups") ?? false;
const enableMonitoring = cfg.getBoolean("enableMonitoring") ?? true;
const rawSshKeyPath =
  cfg.get("sshPublicKeyPath") ?? path.join(os.homedir(), ".ssh", "id_ed25519.pub");
const sshPublicKeyPath = rawSshKeyPath.startsWith("~/")
  ? path.join(os.homedir(), rawSshKeyPath.slice(2))
  : rawSshKeyPath;
const sshAllowedCidr = cfg.get("sshAllowedCidr") || "0.0.0.0/0";

const sshPublicKey = fs.readFileSync(sshPublicKeyPath, "utf8").trim();
const sshFingerprint = sshKeyFingerprint(sshPublicKey);

const cloudInitTemplate = fs.readFileSync(
  path.join(__dirname, "cloud-init.yaml"),
  "utf8",
);
const userData = cloudInitTemplate.replaceAll("__SSH_PUBLIC_KEY__", sshPublicKey);

const droplet = new digitalocean.Droplet(
  "demerzel-droplet",
  {
    name: dropletName,
    region,
    size,
    image,
    backups: enableBackups,
    monitoring: enableMonitoring,
    ipv6: true,
    sshKeys: [sshFingerprint],
    userData,
    tags: ["demerzel", "discord-bot", "translator"],
  },
  { aliases: [{ name: "hermes-droplet" }], ignoreChanges: ["userData"] },
);

const firewall = new digitalocean.Firewall(
  "demerzel-firewall",
  {
    name: `${dropletName}-fw`,
    dropletIds: [droplet.id.apply((id) => parseInt(id, 10))],
    inboundRules: [
      {
        protocol: "tcp",
        portRange: "22",
        sourceAddresses: [sshAllowedCidr],
      },
      // 80/443 reserved for a future health/dashboard endpoint.
      {
        protocol: "tcp",
        portRange: "80",
        sourceAddresses: ["0.0.0.0/0", "::/0"],
      },
      {
        protocol: "tcp",
        portRange: "443",
        sourceAddresses: ["0.0.0.0/0", "::/0"],
      },
      {
        protocol: "icmp",
        sourceAddresses: ["0.0.0.0/0", "::/0"],
      },
    ],
    outboundRules: [
      {
        protocol: "tcp",
        portRange: "1-65535",
        destinationAddresses: ["0.0.0.0/0", "::/0"],
      },
      {
        protocol: "udp",
        portRange: "1-65535",
        destinationAddresses: ["0.0.0.0/0", "::/0"],
      },
      {
        protocol: "icmp",
        destinationAddresses: ["0.0.0.0/0", "::/0"],
      },
    ],
  },
  { aliases: [{ name: "hermes-firewall" }] },
);

const project = new digitalocean.Project(
  "demerzel-project",
  {
    name: projectName,
    description: "Demerzel Discord bot infrastructure",
    purpose: "Service or API",
    environment: pulumi.getStack() === "prod" ? "Production" : "Development",
    resources: [droplet.dropletUrn],
  },
  { aliases: [{ name: "hermes-project" }] },
);

export const dropletId = droplet.id;
export const dropletIp = droplet.ipv4Address;
export const dropletIpv6 = droplet.ipv6Address;
export const dropletName_ = droplet.name;
export const sshKeyFingerprintOut = sshFingerprint;
export const sshCommand = pulumi.interpolate`ssh deploy@${droplet.ipv4Address}`;
export const firewallId = firewall.id;
export const projectId = project.id;
