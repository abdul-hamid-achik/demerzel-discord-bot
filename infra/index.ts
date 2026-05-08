import * as digitalocean from "@pulumi/digitalocean";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const cfg = new pulumi.Config();

const region = cfg.get("region") ?? "nyc3";
const size = cfg.get("size") ?? "s-1vcpu-2gb";
const image = cfg.get("image") ?? "ubuntu-24-04-x64";
const dropletName = cfg.get("dropletName") ?? "hermes-bot";
const projectName = cfg.get("projectName") ?? "hermes-translator";
const enableBackups = cfg.getBoolean("enableBackups") ?? false;
const enableMonitoring = cfg.getBoolean("enableMonitoring") ?? true;
const sshPublicKeyPath =
  cfg.get("sshPublicKeyPath") ?? path.join(os.homedir(), ".ssh", "id_ed25519.pub");
const sshAllowedCidr = cfg.get("sshAllowedCidr") || "0.0.0.0/0";

const sshPublicKey = fs.readFileSync(sshPublicKeyPath, "utf8").trim();

const sshKey = new digitalocean.SshKey("hermes-deploy-key", {
  name: `${dropletName}-deploy`,
  publicKey: sshPublicKey,
});

const cloudInitTemplate = fs.readFileSync(
  path.join(__dirname, "cloud-init.yaml"),
  "utf8",
);
const userData = cloudInitTemplate.replace("${SSH_PUBLIC_KEY}", sshPublicKey);

const droplet = new digitalocean.Droplet("hermes-droplet", {
  name: dropletName,
  region,
  size,
  image,
  backups: enableBackups,
  monitoring: enableMonitoring,
  ipv6: true,
  sshKeys: [sshKey.fingerprint],
  userData,
  tags: ["hermes", "discord-bot", "translator"],
});

const firewall = new digitalocean.Firewall("hermes-firewall", {
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
});

const project = new digitalocean.Project("hermes-project", {
  name: projectName,
  description: "Hermes Translator Discord bot infrastructure",
  purpose: "Service or API",
  environment: pulumi.getStack() === "prod" ? "Production" : "Development",
  resources: [droplet.dropletUrn],
});

export const dropletId = droplet.id;
export const dropletIp = droplet.ipv4Address;
export const dropletIpv6 = droplet.ipv6Address;
export const dropletName_ = droplet.name;
export const sshCommand = pulumi.interpolate`ssh deploy@${droplet.ipv4Address}`;
export const firewallId = firewall.id;
export const projectId = project.id;
