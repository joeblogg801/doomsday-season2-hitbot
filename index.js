const { Doomsday, Viewer, DoomsdayQuery } = require("./contracts");

const col = require('./console.colour');
const {getAddress} = require("ethers/lib/utils");
const log = col.colour;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const totalSupply = async() =>{
    return await Doomsday.totalSupply();
}
const destroyed = async() =>{
    return await Doomsday.destroyed();
}
const vulnerableCities = async(startId,limit) =>{

    return await Viewer.vulnerableCities(startId,limit);
}

const nextImpactIn = async() =>{
    try{
        return await Viewer.nextImpactIn();
    }catch(e){
        return 1;
    }

}

const isVulnerable = async(_tokenId) =>{
    try{
        return await Doomsday.isVulnerable(_tokenId);
    }catch(e){
        return false;
    }

}

const willBecomeVulnerable = async (tokenToEvacuate) => {
    try {
        return await DoomsdayQuery.willBecomeVulnerable(tokenToEvacuate);
    } catch (e) {
        console.log(e);
        return 0;
    }
}


const confirmHit = async(_tokenId) =>{
    try{
        let tx = await Doomsday.confirmHit(_tokenId,{
            gasPrice: 100000000000
        });
        await tx.wait();
    }catch(e){
        console.log(e);
        col.red(" execution failed.");
        // process.exit();
    }
}

const evacuate = async(_tokenId) =>{
    try{
        let tx = await Doomsday.evacuate(_tokenId,{
            gasPrice: 100000000000
        });
        await tx.wait();
    }catch(e){
        console.log(e);
        col.red(" execution failed.");
        // process.exit();
    }
}

async function getVulnerable(){
    let _cities = [];
    let hasError = false;
    try{
        let _limit = 5000;
        let _tokenIdMax = parseInt(await totalSupply()) + parseInt(await destroyed());

        for(let i = 1; i <= _tokenIdMax; i += _limit){
            let chunk  = await vulnerableCities(i,_limit);
            if(chunk.length === 0) break;
            for(let j = 0; j < chunk.length; j++){
                let tokenId = parseInt(chunk[j]);
                if( tokenId !== 0){
                    _cities.push(tokenId);
                }
            }
        }
    }catch(e){
        console.log(e);
        hasError = true;
    }
    return {hasError, vulnerable: _cities};
}

const getBunkerOwner = async (_tokenId) => {
    try {
        return await Doomsday.ownerOf(_tokenId);
    }catch(e){
        return "0x" + "0".repeat(40);
    }
}

let addressToSkip = ''

const isMyself = (bunkerOwner) => {
    return addressToSkip ? bunkerOwner.toLowerCase() === addressToSkip.toLowerCase() : false;
}


let BUNKERS_TO_HIT = (process.env.BUNKERS_TO_HIT || "").split(',').map(value => parseInt(value, 10));
let BUNKER_TO_EVACUATE = parseInt(process.env.BUNKER_TO_EVACUATE, 10) || 0;


async function doTheThing() {
    col.yellow("=== Doomsday Season 2 Hit Confirm Bot ===");
    await DoomsdayQuery.init();
    if (process.env.OWNER_OF_MY_BUNKERS) {
        try {
            addressToSkip = getAddress(process.env.OWNER_OF_MY_BUNKERS);
        } catch (e) {
            col.red(process.env.OWNER_OF_MY_BUNKERS, "is not an address");
        }
    }
    if (addressToSkip) {
        col.yellow("This bot will skip bunkers owned by", addressToSkip);
    } else {
        col.red("This bot will hit all bunkers even your own");
    }
    // only owner can evacuate, check if the current signer is an owner
    if (BUNKER_TO_EVACUATE > 0) {
        const bunkerToEvacuateOwner = await getBunkerOwner(BUNKER_TO_EVACUATE);
        const signerAddress = await Doomsday.signer.getAddress()
        if (bunkerToEvacuateOwner !== signerAddress) {
            col.red(`${signerAddress} does not own ${BUNKER_TO_EVACUATE} (it is owned by ${bunkerToEvacuateOwner}), therefore cannot evacuate it`);
            BUNKER_TO_EVACUATE = 0;
        }
    }
    if (BUNKERS_TO_HIT.length > 0 && BUNKER_TO_EVACUATE <= 0) {
        col.red(`Unable to hit ${BUNKERS_TO_HIT.join(', ')} since there are no bunkers that can be evacuated`);
        BUNKERS_TO_HIT = [];
    }
    if (BUNKERS_TO_HIT.length > 0) {
        const filteredBunkers = []
        for (const bunker of BUNKERS_TO_HIT) {
            const bunkerToHitOwner = await getBunkerOwner(bunker);
            if (isMyself(bunkerToHitOwner)) {
                col.red(`${bunkerToHitOwner} is owned by me, will not hit`);
            } else if (bunkerToHitOwner !== '0x0000000000000000000000000000000000000000') {
                col.yellow(`This bot will try to hit ${bunker} (owned by ${bunkerToHitOwner}) by evacuating ${BUNKER_TO_EVACUATE}`);
                filteredBunkers.push(bunker);
            }
        }
        BUNKERS_TO_HIT = filteredBunkers;
    }
    while (true) {
        if (parseInt(await totalSupply()) < 2) {
            col.green("     Game over.");
            process.exit();
        }

        let _nextImpact = parseInt(await nextImpactIn());

        col.yellow(`next impact in ${_nextImpact} blocks`);

        // if (_nextImpact < 20) {
        //     col.red("NEXT IMPACT TOO SOON");
        //     col.red("  > waiting...");
        //     await sleep(1000 * _nextImpact * 2.3);
        // } else
        if (_nextImpact > 250) {
            col.red("NEXT IMPACT NOT SOON ENOUGH", `(${_nextImpact} blocks)`);
            col.red("  > waiting...");
            await sleep(5000);
        } else {
            let {hasError, vulnerable} = await getVulnerable();
            if (hasError) {
                await sleep(2300);
                continue;
            }

            if (vulnerable.length === 0) {
                col.cyan(" >> NO VULNERABLE BUNKERS");
                if (_nextImpact > 100) {
                    // run this dangerous strategy when everything is settled (there are no vulnerable bunkers)
                    // and there is enough time
                    const vulnerableBunkers = await willBecomeVulnerable(BUNKER_TO_EVACUATE);
                    if (vulnerableBunkers.length) {
                        const tokens = vulnerableBunkers.map(value => value.tokenId);
                        const hasMyBunkers = vulnerableBunkers.some(value => isMyself(value.tokenOwner));
                        col.yellow(` >> Bunkers ${tokens.join(',')} will become vulnerable if ${BUNKER_TO_EVACUATE} is evacuated`);
                        if (hasMyBunkers) {
                            col.yellow(`Some bunkers are mine, do not evacuate`);
                        } else {
                            const hasBunkersToHit = vulnerableBunkers.some(token => BUNKERS_TO_HIT.indexOf(token.tokenId) >= 0);
                            if (hasBunkersToHit) {
                                col.yellow("evacuating:", BUNKER_TO_EVACUATE);
                                await evacuate(BUNKER_TO_EVACUATE);
                                col.green("     done.");
                                continue;
                            }
                        }
                    }
                }
                await sleep(5000);
            } else {
                col.yellow(" > Vulnerable bunkers found");
                for (let i = 0; i < vulnerable.length; i++) {
                    let _tokenId = vulnerable[i];
                    let _tokenOwner = await getBunkerOwner(_tokenId);
                    if (isMyself(_tokenOwner)) {
                        col.blue(` > ${_tokenId} owned by me, skip.`);
                        continue;
                    } else {
                        col.yellow(" > Confirm hit on",_tokenId);
                    }
                    let lastVulnerableCheck = Boolean(await isVulnerable(_tokenId));

                    if (!lastVulnerableCheck) {
                        col.blue("No longer vulnerable, skip.");
                    } else {
                        //execute
                        col.yellow("confirming hit:", _tokenId);
                        await confirmHit(_tokenId);
                        col.green("     done.");
                    }
                }
            }
        }
    }
}

doTheThing();
