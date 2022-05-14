import { Contract } from "ethers";
import { ethers, upgrades } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {
        FLAGS,
        SCHEDULE_PERIOD,
        TAU_PER_STREAM,
        MIN_WEIGHT,
        MAX_WEIGHT,
        AURORA_STREAM_OWNER,
        SCHEDULE_START_TIME,
        AURORA_TOKEN,
        DEFAULT_ADMIN_ROLE_ADDRESS,
        PAUSER_ROLE_ADDRESS,
        AIRDROP_ROLE_ADDRESS,
        CLAIM_ROLE_ADDRESS,
        STREAM_MANAGER_ROLE_ADDRESS,
        TREASURY_MANAGER_ROLE_ADDRESS
    } = process.env
    const tri = "0xFa94348467f64D5A457F75F8bc40495D33c65aBB"
    const bastion = "0x9f1f933c660a1dc856f0e0fe058435879c5ccef0"
    const wnear = "0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d"

    const { save } = hre.deployments;
    const [ deployer ] = await hre.ethers.getSigners()
    const startTime = SCHEDULE_START_TIME ? parseInt(SCHEDULE_START_TIME as string) : Math.floor(Date.now()/ 1000) + 60 
    const flags = 0
    const auroraAddress = AURORA_TOKEN? AURORA_TOKEN : (await hre.ethers.getContract("Token")).address

    // Deploy JetStakingV1.
    // ====================
    let treasury: Contract
    try {
        treasury = await hre.ethers.getContract("Treasury")
        console.log("Reusing deployed Treasury from ./deployments")
    } catch(error) {
        const Treasury = await ethers.getContractFactory("Treasury")
        treasury = await upgrades.deployProxy(
            Treasury,
            [
                [
                    auroraAddress,
                    tri,
                    bastion,
                    wnear,
                ],
                flags
            ],
            {
                initializer: "initialize",
                kind : "uups",
            },
        )
        console.log('Deploy Treasury Proxy done @ ' + treasury.address)
        await new Promise(f => setTimeout(f, 3000));
        const treasuryImpl = await upgrades.upgradeProxy(treasury, Treasury)
        console.log('Deploy Treasury Implementation  done @ ' + treasuryImpl.address)
        const treasuryArtifact = await hre.deployments.getExtendedArtifact('Treasury');
        const treasuryProxyDeployments = {
            address: treasury.address,
            ...treasuryArtifact
        }
        await save('Treasury', treasuryProxyDeployments)
        await new Promise(f => setTimeout(f, 3000));
    }
    await treasury.deployed()

    const treasuryManagerRole = await treasury.TREASURY_MANAGER_ROLE()
    if(!await treasury.hasRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)) {
        await treasury.connect(deployer).grantRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        'Contract: ',
        'Treasury, ',
        'ADDRESS ', 
        TREASURY_MANAGER_ROLE_ADDRESS,
        `Has a role ${treasuryManagerRole}? `,
        await treasury.hasRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
    )
    const treasuryDefaultAdminRole = await treasury.DEFAULT_ADMIN_ROLE()
    if(!await treasury.hasRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)) {
        await treasury.connect(deployer).grantRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        'Contract: ', 
        'Treasury, ',
        'ADDRESS: ', 
        DEFAULT_ADMIN_ROLE_ADDRESS,
        `Has a role ${treasuryDefaultAdminRole}? `,
        await treasury.hasRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
    )

    // Deploy JetStakingV1.
    // ====================
    // TODO: SCHEDULE_PERIOD=7890000 // 3 months
    const scheduleTimes = [
        startTime,
        startTime + parseInt(SCHEDULE_PERIOD as string),
        startTime + 2 * parseInt(SCHEDULE_PERIOD as string),
        startTime + 3 * parseInt(SCHEDULE_PERIOD as string),
        startTime + 4 * parseInt(SCHEDULE_PERIOD as string)
    ]
    // TODO: update schedule rewards before the deployment
    const scheduleRewards = [
        hre.ethers.utils.parseUnits("6000000", 18),// 900k
        hre.ethers.utils.parseUnits("5100000", 18), // 1.2M
        hre.ethers.utils.parseUnits("3900000", 18), // 1.8M
        hre.ethers.utils.parseUnits("2100000", 18), // 2.1M
        // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
        hre.ethers.utils.parseUnits("0", 18), // 0M
    ]

    let jetStakingV1: Contract
    try {
        jetStakingV1 = await hre.ethers.getContract("JetStakingV1")
        console.log("Reusing deployed JetStakingV1 from ./deployments")
    } catch(error) {
        const JetStakingV1 = await ethers.getContractFactory("JetStakingV1")
        jetStakingV1 = await upgrades.deployProxy(
            JetStakingV1,
            [
                AURORA_TOKEN ? AURORA_TOKEN : (await hre.ethers.getContract("Token")).address,
                AURORA_STREAM_OWNER ? AURORA_STREAM_OWNER : deployer.address,
                scheduleTimes,
                scheduleRewards,
                parseInt(TAU_PER_STREAM as string),
                parseInt(FLAGS as string),
                treasury.address,
                parseInt(MAX_WEIGHT as string),
                parseInt(MIN_WEIGHT as string)
            ],
            {
                initializer: "initialize",
                kind : "uups",
            }
        )

        console.log('Deploy JetStakingV1 Proxy done @ ' + jetStakingV1.address)
        await new Promise(f => setTimeout(f, 3000));
        const jetStakingV1Impl = await upgrades.upgradeProxy(jetStakingV1, JetStakingV1)
        console.log('Deploy JetStakingV1 Implementation  done @ ' + jetStakingV1Impl.address)
        const jetStakingV1Artifact = await hre.deployments.getExtendedArtifact('JetStakingV1');
        const jetStakingV1ProxyDeployments = {
            address: jetStakingV1.address,
            ...jetStakingV1Artifact
        }
        await save('JetStakingV1', jetStakingV1ProxyDeployments)
        await new Promise(f => setTimeout(f, 3000));
    }

    await jetStakingV1.deployed()
    console.log(`JetStakingV1 address : ${jetStakingV1.address}`)
    
    const claimRole = await jetStakingV1.CLAIM_ROLE()
    const airdropRole = await jetStakingV1.AIRDROP_ROLE()
    const pauseRole = await jetStakingV1.PAUSE_ROLE()
    const streamManagerRole = await jetStakingV1.STREAM_MANAGER_ROLE()
    const defaultAdminRole = await jetStakingV1.DEFAULT_ADMIN_ROLE()
    console.log(`CLAIM_ROLE: ${claimRole}`)
    console.log(`AIRDROP_ROLE: ${airdropRole}`)
    console.log(`PAUSE_ROLE: ${pauseRole}`)
    console.log(`STREAM_MANAGER_ROLE ${streamManagerRole}`)
    console.log(`DEFAULT ADMIN ROLE: ${defaultAdminRole}`)

    if(!await jetStakingV1.hasRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        STREAM_MANAGER_ROLE_ADDRESS,
        `Has a role ${streamManagerRole}? `,
        await jetStakingV1.hasRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)
    )
    if(!await jetStakingV1.hasRole(claimRole, CLAIM_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(claimRole, CLAIM_ROLE_ADDRESS)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        CLAIM_ROLE_ADDRESS,
        `Has a role ${claimRole}? `,
        await jetStakingV1.hasRole(claimRole, CLAIM_ROLE_ADDRESS)
    )
    if(!await jetStakingV1.hasRole(airdropRole, AIRDROP_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(airdropRole, AIRDROP_ROLE_ADDRESS)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        AIRDROP_ROLE_ADDRESS,
        `Has a role ${airdropRole}? `,
        await jetStakingV1.hasRole(airdropRole, AIRDROP_ROLE_ADDRESS)
    )
    if(!await jetStakingV1.hasRole(pauseRole, PAUSER_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(pauseRole, PAUSER_ROLE_ADDRESS)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        PAUSER_ROLE_ADDRESS,
        `Has a role ${pauseRole}? `,
        await jetStakingV1.hasRole(pauseRole, PAUSER_ROLE_ADDRESS)
    )
    if(!await jetStakingV1.hasRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        DEFAULT_ADMIN_ROLE_ADDRESS,
        `Has a role ${defaultAdminRole}? `,
        await jetStakingV1.hasRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
    )
    // assign jet staking address an admin role in the treasury contract
    if(!await treasury.hasRole(treasuryDefaultAdminRole, jetStakingV1.address)) {
        await treasury.connect(deployer).grantRole(treasuryDefaultAdminRole, jetStakingV1.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        jetStakingV1.address,
        `Has a role ${treasuryDefaultAdminRole}? `,
        await treasury.hasRole(treasuryDefaultAdminRole, jetStakingV1.address)
    )

    // AIRDROP_ROLE_ADDRESS and CLAIM_ROLE_ADDRESS are general purpose.
    // Other addresses used by airdrop script:
    const airdropScriptAddresses = [
        "0xdffE60f55e1Ba75A34FbB54c99556B00Eb5EF83b",
        "0x6C663023EbD9e2444a9565E376a75336C77DE381",
        "0x82AEA31BdeBd16F6D45F61f7308fb2945A25343a",
        "0x1D2b71e9603BAA407D6F3985e987Be579b9Ff7cA",
        "0x3A7a8cf8FF006a00Cc1501a64D133abBabf23210",
        "0x945D345037d64a00F7c56e42A4c7e8Bc6F6951c5",
        "0xe75Dd5eE444ec4CeaF916D6b8c0DE89bE498300B",
        "0x474BD268aEE638F9F64a3549725B4Eb40955B72F",
        "0x05C69cf96C618D9CA81e615C683c0E768f9Eb00C",
        "0xE886BE87ecFC67F17A7b18bA73e0Ab64bB54cF85",
    ]
    console.log("Grant CLAIM_ROLE and AIRDROP_ROLE to airdrop script addresses.")
    // airdropScriptAddresses.forEach(async (addr) => {
    for (const addr of airdropScriptAddresses) {
        if(!await jetStakingV1.hasRole(claimRole, addr)) {
            await jetStakingV1.grantRole(claimRole, addr)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'JetStaking, ',
            'ADDRESS: ',
            addr,
            `Has a role ${claimRole}? `,
            await jetStakingV1.hasRole(claimRole, addr)
        )
        if(!await jetStakingV1.hasRole(airdropRole, addr)) {
            await jetStakingV1.grantRole(airdropRole, addr)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'JetStaking, ',
            'ADDRESS: ',
            addr,
            `Has a role ${airdropRole}? `,
            await jetStakingV1.hasRole(airdropRole, addr)
        )
    }

    // Revoke deployer roles.
    // ======================

    // treasury
    // drop deployer address from the treasury manager role in the treasury contract
    if(await treasury.hasRole(treasuryManagerRole, deployer.address)) {
        await treasury.connect(deployer).revokeRole(treasuryManagerRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${treasuryManagerRole} role in treasury contract`,
        '... Dropped?',
        await treasury.hasRole(treasuryManagerRole, deployer.address) ? false: true
    )

    // drop deployer address from the pause role role in the treasury contract
    if(await treasury.hasRole(pauseRole, deployer.address)) {
        await treasury.connect(deployer).revokeRole(pauseRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${pauseRole} role in treasury contract`,
        '... Dropped?',
        await treasury.hasRole(pauseRole, deployer.address) ? false: true
    )
    // drop deployer address from the default admin role in the treasury contract
    if(await treasury.hasRole(treasuryDefaultAdminRole, deployer.address)) {
        await treasury.connect(deployer).revokeRole(treasuryDefaultAdminRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${treasuryDefaultAdminRole} role in treasury contract`,
        '... Dropped?',
        await treasury.hasRole(treasuryDefaultAdminRole, deployer.address) ? false: true
    )

    // jetStaking
    // drop deployer address from the pause role in the jet-staking contract
    if(await jetStakingV1.hasRole(pauseRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(pauseRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${pauseRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(pauseRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the stream manager role in the jet-staking contract
    if(await jetStakingV1.hasRole(streamManagerRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(streamManagerRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${streamManagerRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(streamManagerRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the claim rolein the jet-staking contract
    if(await jetStakingV1.hasRole(claimRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(claimRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${claimRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(claimRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the airdrop role in the jet-staking contract
    if(await jetStakingV1.hasRole(airdropRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(airdropRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${airdropRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(airdropRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the default admin role in the jet-staking contract
    if(await jetStakingV1.hasRole(defaultAdminRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(defaultAdminRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${defaultAdminRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(defaultAdminRole, deployer.address) ? false: true
    )
}

module.exports = func
module.exports.tags = ["JetStakingV1"]
