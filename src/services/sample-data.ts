/**
 * Sample data for development (#112, profile).
 *
 * The screens cannot be judged while they are empty. This fills a fresh install
 * with plausible running history, a name and an avatar, and a few pairs of
 * shoes — **only** in development, and **only** when there is nothing there
 * already, so it can never overwrite real data.
 *
 * Everything here is invented. The names are not real people, the avatar is a
 * placeholder service, and the runs are generated. It exists so the interface
 * can be evaluated, and deleting the app's data removes it completely.
 */

import { loadProfile, saveProfile, type Profile } from './profile';
import { decodePolyline } from './route-share';
import { deleteRun, listRuns, saveRun } from './run-storage';
import { createShoe, loadShoes, saveShoes } from './shoes';
import type { SavedRun } from './run-session';

const FIRST_NAMES = ['Marta', 'Jonas', 'Amara', 'Theo', 'Lena', 'Ravi', 'Sofia', 'Noah', 'Ines', 'Kai'];
const LAST_NAMES = ['Bianchi', 'Novak', 'Okafor', 'Lindqvist', 'Haddad', 'Moreau', 'Petrov', 'Silva'];

const DAY_MS = 86_400_000;

/**
 * Real pedestrian geometry returned by ORS around Via San Giovanni 53,
 * Lonigo. Keeping the provider result as encoded polylines makes the fixture
 * compact while ensuring sample activity follows actual streets.
 */
const SAMPLE_ROUTES = [
  {
    distanceKm: 8.8,
    polyline:
      '}_`tGe~mdA@BCTIJI^?FCh@MzAKCWvCMJGNKt@?~BFXYjU[pBLB[jCUxAeB~Hc@bB]p@[bAc@nBm@U_FkBa@OuIeDiGiCyD}BGg@X_GMAMCQCOAMEiFoCuGwDA_@BUh@sEXeAyK_Gc@AMFOGKHMP}CzO|C{OPu@?IFOLo@jBmKFa@Ha@Hc@l@eCf@mA|EcKFM\\s@FKs@IeGoBUAa@Hc@b@}EhHk@r@QLMJu@VcGtA?HBJVZPPf@Z\\]VOCJ[ZAJKh@GFk@EUFYZIBs@AcDEs@Bi@Hm@RaAb@o@x@YVg@\\_@j@UPWPoAb@QDHoAVcDUFQ_@uFwDEICYEKqAu@uBuAGMCM?KH_@hCcJBQAKCIe@e@GQCWBm@tFaQfe@x\\FJFd@DLp@l@pDeFZ]VMf@@rBn@pCfAr@HRc@bEoIRFDQbAyBH?HHRi@Xu@R_@Pk@HKHQBOZi@Xa@RMAOCIAGFK@Q?IEG@GEIF?@EL?NIb@ALH\\RxALrA^lBp@jBLFF|AvAfGbGrKjK~AvApAf@`AT^JO~By@dMQXK@c@CAJPB\\FDANFBJ',
  },
  {
    distanceKm: 12.3,
    polyline:
      '}_`tGe~mdACKOGE@]GQC@Kb@BJAPYx@eMN_C@GJ{AEEAKDuAFI@IFu@H{ADs@FgAEK?WDE@E@cCGMBKBYHk@@K]Mg@m@A@EJg@mBQsAASWs@BCAElAcBSW_AmAGMPIvCsFLURQPI@OFIH]JUh@eBbBiE`A{C|@wCt@mC^uAz@aD\\i@HIlAmAtAeA^UdBeA\\Ud@k@j@oAFk@B}AG{AUy@GQnDs@ZBn@Pv@ZJ@HAb@YfBeCl@u@t@w@v@S~@Ah@DPDLHRd@Rc@~AkBbCaC`@S^G^@pAf@XDZA^Mf@[r@q@fAoABNTd@dAfBpIjKqBdCUVCa@GKQ@Wh@W\\c@DPRHn@JRdClENNXNd@d@Rr@ZtA[uASs@e@e@YOOOeCmEKS{F`Hg@j@k@f@w@d@qHrCaBh@kBz@cAn@wD|BeAx@u@zAkA~DYnB?FG\\ADSvAg@|E~@T^XH?XI^KrAa@|A|FxAHdAFGxCL@~Fl@Iv@XF@MjAXD@LBDSJEzBBx@@t@@fDFfBLH?REh@SJINQf@iARUJGPA`@?nAJRB?JFTNJCb@F@D@]jG@JHJ~@NAPAJRBBDHrGBJFBFABCCZBLL?\\S?WR|@PRXN`AZ~@X~C~@h@Pl@BFQDENCNJBH@VJBZPnD`EHHDFHHIIFKGGIIoDaEu@}@MCSDq@Lm@S}CaA_AYCPaA[WDOJSp@@zCMv@Q`@SRu@DUI]SOSg@k@g@[k@SiD_@wAOSC_@tEBLQ`CmCi@IJYpCc@O}@KqDCeBQ}A[kDy@yDYuDAmEg@SESIOzBDNZJl@HBHwASIxAyTyBbB|@Z@hG^bBp@PPZ^l@bAl@vAt@r@~F`A`@Tn@p@`@RrFfBZFZAt@Ij@?\\NZXR`@v@|A\\h@^T`ARrBTsBUaAS_@U]i@w@}ASa@[Y]Ok@?u@H[@[GsFgBa@So@q@a@U_GaAu@s@m@wAm@cA[_@QQcBq@iG_@H\\B`@HvBONMJyEm@SHYXWtCKdAUzCs@Qg@MaBa@MOAC',
  },
  {
    distanceKm: 11.4,
    polyline:
      '}_`tGe~mdACKOGE@]GQC@Kb@BJAPYx@eMN_C@GJ{AEEAKDuAFI@IFu@H{ADs@FgAEK?WDE@E@cCGMBKBYHk@@K]Mg@m@A@EJg@mBQsAASWs@BCAESc@Yc@i@o@g@mAGYD}@AuC@{D?kACWROZ[X_ARy@LcADmBJiALuAB{A?}AEc@u@aB_@q@q@o@UYGSEm@@YH[\\w@^SXIr@ETEXS`@o@Vo@Pq@R{AA_@ScAKYMYOQo@[u@W[AZ@t@Vn@ZNPLXJXRbA@^hAuDP{@?SEc@g@}AAKZe@B@b@x@D@v@En@Ij@AL@LJpB|Dd@|@p@dB`AlB^|@A}AJ}@Lo@Tu@Zk@nAqAXc@n@uB`CfEnDs@ZBn@Pv@ZJ@HAb@YfBeCl@u@t@w@v@S~@Ah@DPDLHRd@Rc@~AkBbCaC`@S^G^@pAf@XDZA^Mf@[r@q@fAoABNTd@dAfBpIjKjB{Bn@o@r@g@tNcI^Wh@e@vAxDPV`Ax@NN?DRANDx@`A`EvCxHfEIt@]jAWnAKlAYnA_@hAOLcAb@MLMZ{@zCiApBKTERC^JxBAb@If@{DbOw@|Bq@hDMx@I^MZQZi@b@oBf@g@Ti@^g@f@eArASLQBmBa@gASOMOSEGKEQHCDc@GWIQMCIOKG?OHGTSCoAKa@?Q@KFSTg@hAOPKHi@RSDI?gBMgDGu@AAZw@VmCx@C?C^KCSG}@ZWJ[IUdCIAKZIJODgDM?JMAcBIe@CKAe@@ODOJgDzDAUGFB`AE^]CWlBi@rAeAz@y@HCt@F?OtC@NNDOzBDNZJl@HBHwASIxAyTyBbB|@Z@hG^bBp@PPZ^l@bAl@vAt@r@~F`A`@Tn@p@`@RrFfBZFZAt@Ij@?\\NZXR`@v@|A\\h@^T`ARrBTsBUaAS_@U]i@w@}ASa@[Y]Ok@?u@H[@[GsFgBa@So@q@a@U_GaAu@s@m@wAm@cA[_@QQcBq@iG_@H\\B`@HvBONMJyEm@SHYXWtCKdAUzCs@Qg@MaBa@MOAC',
  },
] as const;

function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function buildRun(
  daysAgo: number,
  routeIndex: number,
  paceMinPerKm: number,
): SavedRun {
  const route = SAMPLE_ROUTES[routeIndex % SAMPLE_ROUTES.length];
  const distanceKm = route.distanceKm;
  const startedAt = Date.now() - daysAgo * DAY_MS + 7 * 3_600_000;
  const durationSeconds = Math.round(distanceKm * paceMinPerKm * 60);
  const geometry = decodePolyline(route.polyline);
  // Roughly even spacing along the run.
  const timestamps = geometry.map((_, index) =>
    startedAt + Math.round((index / (geometry.length - 1)) * durationSeconds * 1000),
  );

  return {
    id: `sample-${daysAgo}-${Math.round(distanceKm * 10)}`,
    startedAt,
    endedAt: startedAt + durationSeconds * 1000,
    route: null,
    targetDistanceKm: distanceKm,
    distanceKm,
    durationSeconds,
    averagePaceMinPerKm: paceMinPerKm,
    coordinates: geometry,
    timestamps,
    status: 'finished',
  };
}

/**
 * A believable eight weeks using three real street-following Lonigo routes.
 */
async function sampleRuns(): Promise<SavedRun[]> {
  const runs: SavedRun[] = [];
  for (let week = 0; week < 8; week += 1) {
    for (const [weekday, routeIndex, pace] of [
      [1, 0, 5.8],
      [3, 1, 5.4],
      [6, 2, 6.1],
    ] as const) {
      if (week % 4 === 3 && weekday === 3) {
        continue; // one skipped session every fourth week
      }
      const daysAgo = week * 7 + (6 - weekday);
      runs.push(buildRun(daysAgo, routeIndex, pace));
    }
  }
  return runs;
}

let seeded = false;

/**
 * Seed a fresh install. Development only; never touches existing data.
 * Returns true when it seeded.
 */
export async function seedSampleDataIfEmpty(): Promise<boolean> {
  if (!__DEV__ || seeded) {
    return false;
  }

  const [runs, profile, shoes] = await Promise.all([listRuns(), loadProfile(), loadShoes()]);
  const existingSamples = runs.filter((run) => run.id.startsWith('sample-'));
  if (existingSamples.length > 0) {
    await Promise.all(existingSamples.map((run) => deleteRun(run.id)));
    for (const run of await sampleRuns()) {
      await saveRun(run);
    }
    seeded = true;
    return true;
  }
  const hasData = runs.length > 0 || profile.name !== null || shoes.length > 0;
  if (hasData) {
    return false;
  }

  seeded = true;

  const profileWithName: Profile = {
    ...profile,
    name: `${randomOf(FIRST_NAMES)} ${randomOf(LAST_NAMES)}`,
    // A placeholder avatar service; not a real photograph of anyone.
    avatarUri: `https://i.pravatar.cc/256?img=${Math.floor(Math.random() * 60) + 1}`,
  };
  await saveProfile(profileWithName);

  await saveShoes([
    createShoe({ brand: 'Brooks', model: 'Ghost 16', nickname: 'daily pair' }),
    createShoe({ brand: 'Hoka', model: 'Speedgoat 6' }),
    createShoe({ brand: 'Nike', model: 'Vaporfly 3', nickname: 'race day' }),
  ]);

  for (const run of await sampleRuns()) {
    await saveRun(run);
  }

  return true;
}
