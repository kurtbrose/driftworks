// Numeric fields extracted from retail Root_fs2.vp / ships.tbl.
// SHA256: 60266906ff4bc25932ecda1aa8070c92de0e7ab6cde42c2d5a02169c7e6315ca
// Primary gun counts from sparky_fs2.vp POF GPNT records; per-model hashes below.
// Regenerate with tools/import-retail-flight.cjs; see docs/retail-flight-loadouts.md.
window.Driftworks.retailFlightProfiles = [
  {
    "name": "GTF Ulysses",
    "role": "Space Superiority",
    "species": "Terran",
    "damp": 0.1,
    "rotdamp": 0.35,
    "maxVelocity": [
      0,
      0,
      70
    ],
    "rotationTime": [
      3,
      2.6,
      5
    ],
    "rearVelocity": 0,
    "forwardAccel": 2,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 94,
    "afterburnerVelocity": [
      0,
      0,
      150
    ],
    "afterburnerAccel": 0.7,
    "hull": 180,
    "shield": 380,
    "powerOutput": 2,
    "defaultWeapons": [
      "Subach HL-7",
      "Prometheus R"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter01.pof",
      "sha256": "e6fc75620e79bfa5ec0e1328100aa36d30702bdd59bcb03fcbc275bd4e83aeba"
    }
  },
  {
    "name": "GTF Hercules",
    "role": "Heavy Assault",
    "species": "Terran",
    "damp": 0.2,
    "rotdamp": 0.35,
    "maxVelocity": [
      0,
      0,
      50
    ],
    "rotationTime": [
      4,
      4.5,
      4
    ],
    "rearVelocity": 0,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 64,
    "afterburnerVelocity": [
      0,
      0,
      120
    ],
    "afterburnerAccel": 0.7,
    "hull": 250,
    "shield": 600,
    "powerOutput": 3,
    "defaultWeapons": [
      "Subach HL-7",
      "Prometheus R"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 60,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 6,
    "primaryBankMounts": [
      4,
      2
    ],
    "gunMountSource": {
      "model": "fighter06.pof",
      "sha256": "c86b32d00e317608a1196c26778ea5f357c525d22aaf86216c821ef4f95cd405"
    }
  },
  {
    "name": "GTF Myrmidon",
    "role": "Advanced Space Superiority",
    "species": "Terran",
    "damp": 0.2,
    "rotdamp": 0.35,
    "maxVelocity": [
      0,
      0,
      75
    ],
    "rotationTime": [
      4,
      3.7,
      5
    ],
    "rearVelocity": 0,
    "forwardAccel": 2.4,
    "forwardDecel": 2,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 95,
    "afterburnerVelocity": [
      0,
      0,
      135
    ],
    "afterburnerAccel": 0.8,
    "hull": 290,
    "shield": 390,
    "powerOutput": 2.4,
    "defaultWeapons": [
      "Prometheus R",
      "Subach HL-7"
    ],
    "afterburnerFuel": 320,
    "afterburnerBurnRate": 60,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 6,
    "primaryBankMounts": [
      2,
      4
    ],
    "gunMountSource": {
      "model": "fighter2t-05.pof",
      "sha256": "9f4878c5a72aa8b5c240700df395f7b55e943b722a9eb26b54f9cf9b69de4c33"
    }
  },
  {
    "name": "GTB Medusa",
    "role": "Heavy Bomber",
    "species": "Terran",
    "damp": 0.35,
    "rotdamp": 0.55,
    "maxVelocity": [
      0,
      0,
      50
    ],
    "rotationTime": [
      5,
      4.5,
      5
    ],
    "rearVelocity": 0,
    "forwardAccel": 4,
    "forwardDecel": 2,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 65,
    "afterburnerVelocity": [
      0,
      0,
      100
    ],
    "afterburnerAccel": 0.7,
    "hull": 350,
    "shield": 700,
    "powerOutput": 4,
    "defaultWeapons": [
      "Prometheus R"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 2,
    "primaryBankMounts": [
      2
    ],
    "gunMountSource": {
      "model": "bomber04.pof",
      "sha256": "9de058b7c44fa6e22b9c68faf241273bde9cb5145c38262ced2c1fe5e170b00e"
    }
  },
  {
    "name": "GTB Artemis",
    "role": "Medium Bomber",
    "species": "Terran",
    "damp": 0.35,
    "rotdamp": 0.55,
    "maxVelocity": [
      0,
      0,
      65
    ],
    "rotationTime": [
      5,
      4.5,
      5
    ],
    "rearVelocity": 0,
    "forwardAccel": 4,
    "forwardDecel": 2,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 65,
    "afterburnerVelocity": [
      0,
      0,
      110
    ],
    "afterburnerAccel": 0.7,
    "hull": 275,
    "shield": 700,
    "powerOutput": 4,
    "defaultWeapons": [
      "Subach HL-7"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      4
    ],
    "gunMountSource": {
      "model": "bomber2t-03.pof",
      "sha256": "23bbb49e0243cd7c400678cacdf8ad5928db3f089f8100b212fce1fbebe2e3cf"
    }
  },
  {
    "name": "GTB Artemis D.H.",
    "role": "Medium Bomber",
    "species": "Terran",
    "damp": 0.35,
    "rotdamp": 0.55,
    "maxVelocity": [
      0,
      0,
      65
    ],
    "rotationTime": [
      5,
      4.5,
      5
    ],
    "rearVelocity": 0,
    "forwardAccel": 4,
    "forwardDecel": 2,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 65,
    "afterburnerVelocity": [
      0,
      0,
      110
    ],
    "afterburnerAccel": 0.7,
    "hull": 275,
    "shield": 700,
    "powerOutput": 4,
    "defaultWeapons": [
      "Subach HL-7"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      4
    ],
    "gunMountSource": {
      "model": "bonus2t-01.pof",
      "sha256": "5dbe447d68b3a7cfc77ca4b13d84c19613aa3aad43d924b1ba2b2650a754f323"
    }
  },
  {
    "name": "GTB Boanerges",
    "role": "Heavy Bomber",
    "species": "Terran",
    "damp": 0.35,
    "rotdamp": 0.55,
    "maxVelocity": [
      0,
      0,
      55
    ],
    "rotationTime": [
      5.5,
      6,
      6
    ],
    "rearVelocity": 0,
    "forwardAccel": 4,
    "forwardDecel": 2,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 65,
    "afterburnerVelocity": [
      0,
      0,
      85
    ],
    "afterburnerAccel": 0.7,
    "hull": 325,
    "shield": 850,
    "powerOutput": 4,
    "defaultWeapons": [
      "Prometheus R"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 2,
    "primaryBankMounts": [
      2
    ],
    "gunMountSource": {
      "model": "bomber2t-01.pof",
      "sha256": "279d699a63d4c715b25f42ad2034be0d197989780ba0927241e9039e41056573"
    }
  },
  {
    "name": "GTB Ursa",
    "role": "Assault Bomber",
    "species": "Terran",
    "damp": 0.2,
    "rotdamp": 0.55,
    "maxVelocity": [
      0,
      0,
      45
    ],
    "rotationTime": [
      5.5,
      6,
      6
    ],
    "rearVelocity": 0,
    "forwardAccel": 4,
    "forwardDecel": 2,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 60,
    "afterburnerVelocity": [
      0,
      0,
      90
    ],
    "afterburnerAccel": 0.7,
    "hull": 550,
    "shield": 850,
    "powerOutput": 4.5,
    "defaultWeapons": [
      "Prometheus R",
      "Prometheus R"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 80,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 5,
    "primaryBankMounts": [
      3,
      2
    ],
    "gunMountSource": {
      "model": "bomber05.pof",
      "sha256": "80d0514f14e3bf5d249a019f4a8c75923bcd4af524235b27a457228733082de4"
    }
  },
  {
    "name": "GTB Zeus",
    "role": "Strike Bomber",
    "species": "Terran",
    "damp": 0.2,
    "rotdamp": 0.55,
    "maxVelocity": [
      0,
      0,
      55
    ],
    "rotationTime": [
      4,
      4.5,
      3
    ],
    "rearVelocity": 0,
    "forwardAccel": 1,
    "forwardDecel": 0.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 75,
    "afterburnerVelocity": [
      0,
      0,
      110
    ],
    "afterburnerAccel": 0.7,
    "hull": 200,
    "shield": 450,
    "powerOutput": 3,
    "defaultWeapons": [
      "Prometheus R",
      "Prometheus R"
    ],
    "afterburnerFuel": 500,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "bomber09.pof",
      "sha256": "e362b95547d34663ffcdb65bcb4c217f7535bc9b657777643b2f8d2249279b66"
    }
  },
  {
    "name": "GTF Ares",
    "role": "Strategic Assault",
    "species": "Terran",
    "damp": 0.2,
    "rotdamp": 0.35,
    "maxVelocity": [
      0,
      0,
      50
    ],
    "rotationTime": [
      4.5,
      5,
      4
    ],
    "rearVelocity": 0,
    "forwardAccel": 2.4,
    "forwardDecel": 1.3,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 62,
    "afterburnerVelocity": [
      0,
      0,
      120
    ],
    "afterburnerAccel": 0.7,
    "hull": 425,
    "shield": 650,
    "powerOutput": 5,
    "defaultWeapons": [
      "Subach HL-7",
      "Prometheus R"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 62,
    "afterburnerRecoveryRate": 35,
    "gunMounts": 6,
    "primaryBankMounts": [
      2,
      4
    ],
    "gunMountSource": {
      "model": "bonus2t-02.pof",
      "sha256": "143991f0ee2651981ef4218f7f13b3c1f632ef95572a5c7d5536b7a2a4bda9c5"
    }
  },
  {
    "name": "GTF Erinyes",
    "role": "Heavy Assault",
    "species": "Terran",
    "damp": 0.25,
    "rotdamp": 0.4,
    "maxVelocity": [
      0,
      0,
      65
    ],
    "rotationTime": [
      3.8,
      4.2,
      3.8
    ],
    "rearVelocity": 0,
    "forwardAccel": 3.6,
    "forwardDecel": 1.3,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 70,
    "afterburnerVelocity": [
      0,
      0,
      130
    ],
    "afterburnerAccel": 0.75,
    "hull": 325,
    "shield": 500,
    "powerOutput": 3.3,
    "defaultWeapons": [
      "Subach HL-7",
      "Prometheus R"
    ],
    "afterburnerFuel": 420,
    "afterburnerBurnRate": 55,
    "afterburnerRecoveryRate": 29,
    "gunMounts": 8,
    "primaryBankMounts": [
      4,
      4
    ],
    "gunMountSource": {
      "model": "fighter2t-04.pof",
      "sha256": "3149a20b715947eaff116a8e5a0de08c9e54bbac6c009172833cefd74e67d42d"
    }
  },
  {
    "name": "GTF Hercules Mark II",
    "role": "Heavy Assault",
    "species": "Terran",
    "damp": 0.25,
    "rotdamp": 0.4,
    "maxVelocity": [
      0,
      0,
      55
    ],
    "rotationTime": [
      3.8,
      4.2,
      3.8
    ],
    "rearVelocity": 0,
    "forwardAccel": 3.6,
    "forwardDecel": 1.3,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 65,
    "afterburnerVelocity": [
      0,
      0,
      120
    ],
    "afterburnerAccel": 0.75,
    "hull": 275,
    "shield": 610,
    "powerOutput": 3,
    "defaultWeapons": [
      "Subach HL-7",
      "Prometheus R"
    ],
    "afterburnerFuel": 400,
    "afterburnerBurnRate": 55,
    "afterburnerRecoveryRate": 19,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter2t-02.pof",
      "sha256": "03a21fe67ad0d056ec723b746119a5b65e55d33f0600554a57e6a87386bbcc37"
    }
  },
  {
    "name": "GTF Loki",
    "role": "Recon",
    "species": "Terran",
    "damp": 0.2,
    "rotdamp": 0.35,
    "maxVelocity": [
      0,
      0,
      75
    ],
    "rotationTime": [
      3.2,
      3.2,
      2
    ],
    "rearVelocity": 0,
    "forwardAccel": 2,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 95,
    "afterburnerVelocity": [
      0,
      0,
      160
    ],
    "afterburnerAccel": 0.7,
    "hull": 250,
    "shield": 400,
    "powerOutput": 3,
    "defaultWeapons": [
      "Subach HL-7",
      "Prometheus R"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 60,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter13.pof",
      "sha256": "5558dbc03eff5704731c3b7ac2f09bc43bd2d5ffec9888ac851901858711131f"
    }
  },
  {
    "name": "GTF Pegasus",
    "role": "Stealth Recon",
    "species": "Terran",
    "damp": 0.2,
    "rotdamp": 0.35,
    "maxVelocity": [
      0,
      0,
      90
    ],
    "rotationTime": [
      2.5,
      2.6,
      2
    ],
    "rearVelocity": 0,
    "forwardAccel": 2,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 110,
    "afterburnerVelocity": [
      0,
      0,
      160
    ],
    "afterburnerAccel": 0.7,
    "hull": 220,
    "shield": 330,
    "powerOutput": 3,
    "defaultWeapons": [
      "Subach HL-7"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 60,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 2,
    "primaryBankMounts": [
      2
    ],
    "gunMountSource": {
      "model": "fighter2t-01.pof",
      "sha256": "707ce2dbfdaf8b84813c35660581265c5f8d7b65045f286e397fdd4975becc45"
    }
  },
  {
    "name": "GTF Perseus",
    "role": "Interceptor",
    "species": "Terran",
    "damp": 0.15,
    "rotdamp": 0.35,
    "maxVelocity": [
      0,
      0,
      80
    ],
    "rotationTime": [
      3.3,
      3.3,
      3.3
    ],
    "rearVelocity": 0,
    "forwardAccel": 2,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 100,
    "afterburnerVelocity": [
      0,
      0,
      140
    ],
    "afterburnerAccel": 0.8,
    "hull": 265,
    "shield": 350,
    "powerOutput": 2,
    "defaultWeapons": [
      "Subach HL-7",
      "Prometheus R"
    ],
    "afterburnerFuel": 330,
    "afterburnerBurnRate": 60,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter2t-03.pof",
      "sha256": "de8079ed8effbc8f73c0000e99efd59e465a9760f062a264a975af820d253d4e"
    }
  },
  {
    "name": "GVB Bakha",
    "role": "Advanced Bomber",
    "species": "Vasudan",
    "damp": 0.2,
    "rotdamp": 0.55,
    "maxVelocity": [
      0,
      0,
      65
    ],
    "rotationTime": [
      4.2,
      4.6,
      4
    ],
    "rearVelocity": 0,
    "forwardAccel": 5,
    "forwardDecel": 2,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 65,
    "afterburnerVelocity": [
      0,
      0,
      105
    ],
    "afterburnerAccel": 0.7,
    "hull": 440,
    "shield": 620,
    "powerOutput": 4.3,
    "defaultWeapons": [
      "Mekhu HL-7",
      "Mekhu HL-7"
    ],
    "afterburnerFuel": 320,
    "afterburnerBurnRate": 45,
    "afterburnerRecoveryRate": 23,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter2v-03.pof",
      "sha256": "49e8aeba89ad9d4e5341587462312bf94a4cd5939a821d028d2bc03d51912541"
    }
  },
  {
    "name": "GVB Osiris",
    "role": "Reserve Bomber",
    "species": "Vasudan",
    "damp": 0.2,
    "rotdamp": 0.55,
    "maxVelocity": [
      0,
      0,
      50
    ],
    "rotationTime": [
      5,
      5,
      5
    ],
    "rearVelocity": 0,
    "forwardAccel": 4,
    "forwardDecel": 2,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 64,
    "afterburnerVelocity": [
      0,
      0,
      100
    ],
    "afterburnerAccel": 0.7,
    "hull": 600,
    "shield": 600,
    "powerOutput": 3,
    "defaultWeapons": [
      "Mekhu HL-7"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 2,
    "primaryBankMounts": [
      2
    ],
    "gunMountSource": {
      "model": "bomber06.pof",
      "sha256": "7d8a82953cb9c933af2450e511bc7763d9af940a4705f498fbf43804caf24356"
    }
  },
  {
    "name": "GVB Sekhmet",
    "role": "Bomber",
    "species": "Vasudan",
    "damp": 0.2,
    "rotdamp": 0.55,
    "maxVelocity": [
      0,
      0,
      60
    ],
    "rotationTime": [
      4,
      4,
      4
    ],
    "rearVelocity": 0,
    "forwardAccel": 5,
    "forwardDecel": 2,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 64,
    "afterburnerVelocity": [
      0,
      0,
      100
    ],
    "afterburnerAccel": 0.7,
    "hull": 500,
    "shield": 850,
    "powerOutput": 3,
    "defaultWeapons": [
      "Prometheus R"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      4
    ],
    "gunMountSource": {
      "model": "bomber2v-02.pof",
      "sha256": "8674063550067940b029ac7663818e496e9b56b3d128581f64a3458f99559628"
    }
  },
  {
    "name": "GVF Horus",
    "role": "Interceptor",
    "species": "Vasudan",
    "damp": 0.2,
    "rotdamp": 0.4,
    "maxVelocity": [
      0,
      0,
      90
    ],
    "rotationTime": [
      3.4,
      3.9,
      3.6
    ],
    "rearVelocity": 0,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 110,
    "afterburnerVelocity": [
      0,
      0,
      170
    ],
    "afterburnerAccel": 0.7,
    "hull": 170,
    "shield": 230,
    "powerOutput": 2.2,
    "defaultWeapons": [
      "Mekhu HL-7",
      "Morning Star"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter08.pof",
      "sha256": "a3911a80173c4368035e24f834670facff94905c1f56c52ae64028140ddc8d73"
    }
  },
  {
    "name": "GVF Ptah",
    "role": "Stealth Recon",
    "species": "Vasudan",
    "damp": 0.2,
    "rotdamp": 0.35,
    "maxVelocity": [
      0,
      0,
      90
    ],
    "rotationTime": [
      2.5,
      2.6,
      2
    ],
    "rearVelocity": 0,
    "forwardAccel": 2,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 110,
    "afterburnerVelocity": [
      0,
      0,
      160
    ],
    "afterburnerAccel": 0.7,
    "hull": 220,
    "shield": 330,
    "powerOutput": 3,
    "defaultWeapons": [
      "Mekhu HL-7"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 60,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 2,
    "primaryBankMounts": [
      2
    ],
    "gunMountSource": {
      "model": "fighter2v-04.pof",
      "sha256": "9df583a87fcedad0d3785a60e402d5b2ade25a27912c6e8496ebff2bcd1a0c83"
    }
  },
  {
    "name": "GVF Serapis",
    "role": "Advanced Interceptor",
    "species": "Vasudan",
    "damp": 0.2,
    "rotdamp": 0.4,
    "maxVelocity": [
      0,
      0,
      75
    ],
    "rotationTime": [
      2.6,
      2.2,
      2.8
    ],
    "rearVelocity": 0,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 78,
    "afterburnerVelocity": [
      0,
      0,
      135
    ],
    "afterburnerAccel": 0.7,
    "hull": 220,
    "shield": 200,
    "powerOutput": 3.4,
    "defaultWeapons": [
      "Prometheus R",
      "Akheton SDG"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter2v-01.pof",
      "sha256": "c0289628f7db93bcdf39b737f565268aae5330ff2bc3ec121aa3769a3a901086"
    }
  },
  {
    "name": "GVF Seth",
    "role": "Heavy Fighter",
    "species": "Vasudan",
    "damp": 0.2,
    "rotdamp": 0.4,
    "maxVelocity": [
      0,
      0,
      55
    ],
    "rotationTime": [
      4,
      5,
      5
    ],
    "rearVelocity": 0,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 72,
    "afterburnerVelocity": [
      0,
      0,
      130
    ],
    "afterburnerAccel": 0.7,
    "hull": 280,
    "shield": 580,
    "powerOutput": 3,
    "defaultWeapons": [
      "Mekhu HL-7",
      "Mekhu HL-7"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter07.pof",
      "sha256": "3331ecf6ddfa2776e631324e56b1a5aa80527c420dfffdb50fcd03faec5486c6"
    }
  },
  {
    "name": "GVF Tauret",
    "role": "Heavy Fighter",
    "species": "Vasudan",
    "damp": 0.2,
    "rotdamp": 0.4,
    "maxVelocity": [
      0,
      0,
      65
    ],
    "rotationTime": [
      4.1,
      4.8,
      4.8
    ],
    "rearVelocity": 0,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 75,
    "afterburnerVelocity": [
      0,
      0,
      135
    ],
    "afterburnerAccel": 0.7,
    "hull": 300,
    "shield": 530,
    "powerOutput": 3,
    "defaultWeapons": [
      "Mekhu HL-7",
      "Mekhu HL-7"
    ],
    "afterburnerFuel": 360,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 21,
    "gunMounts": 6,
    "primaryBankMounts": [
      2,
      4
    ],
    "gunMountSource": {
      "model": "fighter2v-02.pof",
      "sha256": "43dd1bd9208bbda1e08156f13b8dbfafedf595abeedb0a8ff5da2692f2a4cc1e"
    }
  },
  {
    "name": "GVF Thoth",
    "role": "Space Superiority",
    "species": "Vasudan",
    "damp": 0.2,
    "rotdamp": 0.4,
    "maxVelocity": [
      0,
      0,
      65
    ],
    "rotationTime": [
      2.7,
      2.7,
      3
    ],
    "rearVelocity": 0,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 0,
    "slideDecel": 0,
    "overclockSpeed": 78,
    "afterburnerVelocity": [
      0,
      0,
      130
    ],
    "afterburnerAccel": 0.7,
    "hull": 200,
    "shield": 200,
    "powerOutput": 2.5,
    "defaultWeapons": [
      "Prometheus R"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      4
    ],
    "gunMountSource": {
      "model": "fighter09.pof",
      "sha256": "f2593b49299019d83fdf8b793015119cc94b4b78f0b8febd941e73c1fc4dfe7d"
    }
  },
  {
    "name": "SB Nahema",
    "role": "Bomber",
    "species": "Shivan",
    "damp": 0.2,
    "rotdamp": 0.5,
    "maxVelocity": [
      19,
      19,
      90
    ],
    "rotationTime": [
      6,
      6,
      6
    ],
    "rearVelocity": 12,
    "forwardAccel": 2.5,
    "forwardDecel": 2,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 72,
    "afterburnerVelocity": [
      0,
      0,
      150
    ],
    "afterburnerAccel": 0.7,
    "hull": 300,
    "shield": 900,
    "powerOutput": 4,
    "defaultWeapons": [
      "Shivan Light Laser",
      "Shivan Heavy Laser"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "bomber2s-02.pof",
      "sha256": "9d37c87eea9ab7c4d57fd9c8b9fc2840c694018329729438031fcd495d651915"
    }
  },
  {
    "name": "SB Nephilim",
    "role": "Bomber",
    "species": "Shivan",
    "damp": 0.2,
    "rotdamp": 0.5,
    "maxVelocity": [
      12,
      12,
      60
    ],
    "rotationTime": [
      6,
      6,
      6
    ],
    "rearVelocity": 12,
    "forwardAccel": 4,
    "forwardDecel": 2,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 72,
    "afterburnerVelocity": [
      12,
      12,
      60
    ],
    "afterburnerAccel": 4,
    "hull": 500,
    "shield": 1600,
    "powerOutput": 4,
    "defaultWeapons": [
      "Shivan Light Laser"
    ],
    "afterburnerFuel": 0,
    "afterburnerBurnRate": 0,
    "afterburnerRecoveryRate": 0,
    "gunMounts": 7,
    "primaryBankMounts": [
      7
    ],
    "gunMountSource": {
      "model": "bomber08.pof",
      "sha256": "4c6c0c708cb3c90676f7b3cfa3bb314dcdfa7af03fe19e95430d171ea3525901"
    }
  },
  {
    "name": "SB Seraphim",
    "role": "Bomber",
    "species": "Shivan",
    "damp": 0.2,
    "rotdamp": 0.5,
    "maxVelocity": [
      12,
      12,
      60
    ],
    "rotationTime": [
      6,
      6,
      6
    ],
    "rearVelocity": 12,
    "forwardAccel": 4,
    "forwardDecel": 2,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 90,
    "afterburnerVelocity": [
      12,
      12,
      60
    ],
    "afterburnerAccel": 4,
    "hull": 500,
    "shield": 1600,
    "powerOutput": 4,
    "defaultWeapons": [
      "Shivan Light Laser",
      "Shivan Light Laser",
      "Shivan Light Laser"
    ],
    "afterburnerFuel": 0,
    "afterburnerBurnRate": 0,
    "afterburnerRecoveryRate": 0,
    "gunMounts": 11,
    "primaryBankMounts": [
      6,
      2,
      3
    ],
    "gunMountSource": {
      "model": "bomber10.pof",
      "sha256": "f613ef336db69c180b7e6204a8769eb249a512a4815bd4c2c266d5b714a03356"
    }
  },
  {
    "name": "SB Taurvi",
    "role": "Bomber",
    "species": "Shivan",
    "damp": 0.2,
    "rotdamp": 0.5,
    "maxVelocity": [
      12,
      12,
      65
    ],
    "rotationTime": [
      6,
      6,
      6
    ],
    "rearVelocity": 12,
    "forwardAccel": 4.5,
    "forwardDecel": 2,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 72,
    "afterburnerVelocity": [
      12,
      12,
      65
    ],
    "afterburnerAccel": 4.5,
    "hull": 600,
    "shield": 1000,
    "powerOutput": 4,
    "defaultWeapons": [
      "Shivan Light Laser",
      "Shivan Heavy Laser"
    ],
    "afterburnerFuel": 0,
    "afterburnerBurnRate": 0,
    "afterburnerRecoveryRate": 0,
    "gunMounts": 3,
    "primaryBankMounts": [
      1,
      2
    ],
    "gunMountSource": {
      "model": "bomber2s-01.pof",
      "sha256": "5d8b1ec5118c7c0fc0d3490b31ec615c5ddab61ca12c41a00586374d3dddc140"
    }
  },
  {
    "name": "SF Aeshma",
    "role": "Fighter",
    "species": "Shivan",
    "damp": 0.2,
    "rotdamp": 0.4,
    "maxVelocity": [
      17,
      17,
      68
    ],
    "rotationTime": [
      3.3,
      3.3,
      3.7
    ],
    "rearVelocity": 20,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 68,
    "afterburnerVelocity": [
      0,
      0,
      110
    ],
    "afterburnerAccel": 0.7,
    "hull": 125,
    "shield": 850,
    "powerOutput": 2.25,
    "defaultWeapons": [
      "Shivan Mega Laser",
      "Shivan Heavy Laser"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter2s-01.pof",
      "sha256": "b675db0ab4a1c7d9684763205fa2151170731d70c38133801af568d1fbe8b627"
    }
  },
  {
    "name": "SF Astaroth",
    "role": "Fighter",
    "species": "Shivan",
    "damp": 0.2,
    "rotdamp": 0.3,
    "maxVelocity": [
      25,
      25,
      80
    ],
    "rotationTime": [
      3.4,
      3.2,
      3.2
    ],
    "rearVelocity": 25,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 110,
    "afterburnerVelocity": [
      0,
      0,
      155
    ],
    "afterburnerAccel": 0.7,
    "hull": 100,
    "shield": 450,
    "powerOutput": 1.5,
    "defaultWeapons": [
      "Shivan Mega Laser"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 70,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 2,
    "primaryBankMounts": [
      2
    ],
    "gunMountSource": {
      "model": "fighter2s-03.pof",
      "sha256": "cbe1841e2b1ccce165b2d192fc5c0da09655c039a5adaccc77d1275cdd7dee7d"
    }
  },
  {
    "name": "SF Basilisk",
    "role": "Fighter",
    "species": "Shivan",
    "damp": 0.2,
    "rotdamp": 0.4,
    "maxVelocity": [
      15,
      15,
      65
    ],
    "rotationTime": [
      3.5,
      3.5,
      4
    ],
    "rearVelocity": 20,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 68,
    "afterburnerVelocity": [
      0,
      0,
      110
    ],
    "afterburnerAccel": 0.7,
    "hull": 100,
    "shield": 950,
    "powerOutput": 2.25,
    "defaultWeapons": [
      "Shivan Mega Laser",
      "Shivan Heavy Laser"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter10.pof",
      "sha256": "061dff14f9698254651712f1a06835d084e6dd5eb57de80c4a09e22e7154972d"
    }
  },
  {
    "name": "SF Dragon",
    "role": "Fighter",
    "species": "Shivan",
    "damp": 0.1,
    "rotdamp": 0.4,
    "maxVelocity": [
      20,
      20,
      75
    ],
    "rotationTime": [
      2.5,
      2,
      2
    ],
    "rearVelocity": 30,
    "forwardAccel": 2,
    "forwardDecel": 0.75,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 90,
    "afterburnerVelocity": [
      0,
      0,
      150
    ],
    "afterburnerAccel": 0.7,
    "hull": 100,
    "shield": 700,
    "powerOutput": 2,
    "defaultWeapons": [
      "Shivan Heavy Laser",
      "Shivan Heavy Laser"
    ],
    "afterburnerFuel": 200,
    "afterburnerBurnRate": 60,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 5,
    "primaryBankMounts": [
      2,
      3
    ],
    "gunMountSource": {
      "model": "fighter03.pof",
      "sha256": "a4b3e1ef20129bd9b890314b573707d8bf8464b81687dbf4722f6f556c3419ef"
    }
  },
  {
    "name": "SF Manticore",
    "role": "Fighter",
    "species": "Shivan",
    "damp": 0.2,
    "rotdamp": 0.3,
    "maxVelocity": [
      25,
      25,
      87
    ],
    "rotationTime": [
      3.2,
      3.2,
      3.2
    ],
    "rearVelocity": 25,
    "forwardAccel": 3,
    "forwardDecel": 1.5,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 120,
    "afterburnerVelocity": [
      0,
      0,
      155
    ],
    "afterburnerAccel": 0.7,
    "hull": 100,
    "shield": 500,
    "powerOutput": 1.5,
    "defaultWeapons": [
      "Shivan Mega Laser"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 70,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 2,
    "primaryBankMounts": [
      2
    ],
    "gunMountSource": {
      "model": "fighter11.pof",
      "sha256": "29a332f7990372ed0dec786dc943b735afeb4b3c0eee504959ea008b9b824cf5"
    }
  },
  {
    "name": "SF Mara",
    "role": "Fighter",
    "species": "Shivan",
    "damp": 0.2,
    "rotdamp": 0.4,
    "maxVelocity": [
      15,
      15,
      70
    ],
    "rotationTime": [
      3,
      3,
      3.5
    ],
    "rearVelocity": 20,
    "forwardAccel": 2.5,
    "forwardDecel": 1,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 78,
    "afterburnerVelocity": [
      0,
      0,
      120
    ],
    "afterburnerAccel": 0.7,
    "hull": 200,
    "shield": 620,
    "powerOutput": 2.5,
    "defaultWeapons": [
      "Shivan Mega Laser",
      "Shivan Heavy Laser"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter2s-02.pof",
      "sha256": "299baa2574ba15f0a4ff40ee02385517b192aa972d9b288ad635afcb7186d6b7"
    }
  },
  {
    "name": "SF Mara (terrans)",
    "role": "Advanced Space Superiority",
    "species": "Terran",
    "damp": 0.2,
    "rotdamp": 0.4,
    "maxVelocity": [
      15,
      15,
      75
    ],
    "rotationTime": [
      3,
      3,
      3.5
    ],
    "rearVelocity": 0,
    "forwardAccel": 2.5,
    "forwardDecel": 1,
    "slideAccel": 2,
    "slideDecel": 2,
    "overclockSpeed": 95,
    "afterburnerVelocity": [
      0,
      0,
      135
    ],
    "afterburnerAccel": 0.7,
    "hull": 475,
    "shield": 700,
    "powerOutput": 4.5,
    "defaultWeapons": [
      "Subach HL-7",
      "UD-8 Kayser"
    ],
    "afterburnerFuel": 300,
    "afterburnerBurnRate": 50,
    "afterburnerRecoveryRate": 25,
    "gunMounts": 4,
    "primaryBankMounts": [
      2,
      2
    ],
    "gunMountSource": {
      "model": "fighter2s-02.pof",
      "sha256": "299baa2574ba15f0a4ff40ee02385517b192aa972d9b288ad635afcb7186d6b7"
    }
  }
];
