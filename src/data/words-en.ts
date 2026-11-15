// ~1000 common English words, lowercase, letters only.
const RAW = `
the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an
will my one all would there their what so up out if about who get which go me when make can like time no just him
know take people into year your good some could them see other than then now look only come its over think also
back after use two how our work first well way even new want because any these give day most us is was are were
been has had did said made went got came saw took found gave told thought called tried asked felt left kept began
seemed helped showed heard played ran moved lived believed brought happened wrote sat stood lost paid met included
continued set learned changed led understood watched followed stopped created spoke read spent grew opened walked
won offered remembered loved considered appeared bought waited served died sent expected built stayed fell cut
reached killed remained suggested raised passed sold required reported decided pulled
life child world school still try last ask need feel become leave put mean keep let begin seem help talk turn
start show hear play run move live believe hold bring happen write provide sit stand lose pay meet include
continue learn change lead understand watch follow stop create speak allow add spend grow open walk win offer
remember love consider appear buy wait serve die send expect build stay fall reach kill remain suggest raise pass
sell require report decide pull return explain hope develop carry break receive agree support hit produce eat
cover catch draw choose cause point listen realize place close drive enjoy fill finish laugh pick push save
share sing sleep smile teach throw travel visit wear wish worry answer arrive call clean cook count cross dance
dream drink drop fly forget fix hate hurt join jump kick kiss knock lie mark miss order paint plan pray rain rest
ride ring rise roll rush shake shine shoot shop shout sign sink skip smell solve spell spin steal swim taste tell
thank touch trade train trust type vote warn wash wonder
man woman thing person hand part eye place week case point number group problem fact house home room money night
water mother father family story student country city friend book idea word business issue side kind head service
power hour game line end member law car door face health others level office art war history party result morning
reason research girl boy guy moment air teacher force education foot age policy music market sense nation plan
college interest death experience effect class control care field development role effort rate heart drug show
leader light voice wife police mind price report decision son view relationship town road arm difference value
building action model season society tax director position player record paper space ground form event official
matter center couple site project activity star table need court oil situation cost industry figure street image
phone data picture practice piece land product doctor wall patient worker news test movie north love support
technology step baby computer type attention film tree source organization hair window evidence population site
media sun planet moon ship rocket earth sky ocean river mountain forest island desert stone rock metal glass fire
ice snow wind storm cloud wave signal code screen keyboard mouse system network memory error virus pixel laser
robot engine machine circuit battery cable wire chip data file folder server cloud signal radio orbit galaxy
comet asteroid gravity energy matter light shadow dark night dawn noon dusk spring summer autumn winter
garden kitchen bedroom bridge castle tower village city market harbor station airport museum library hospital
apple bread cheese coffee cookie egg fish fruit honey juice lemon meat milk orange pizza rice salad salt soup sugar
tea tomato banana cake candy carrot chicken corn grape potato sandwich
cat dog bird horse cow pig sheep lion tiger bear wolf fox rabbit mouse snake frog whale shark eagle owl duck bee
red blue green yellow purple orange pink black white gray brown gold silver
good new first last long great little own other old right big high different small large next early young important
few public bad same able free sure clear full special easy strong whole real best better true late hard major
certain open simple recent fast slow quick bright dark heavy light warm cold hot cool soft loud quiet happy sad
angry calm brave smart clever funny strange wild deep wide narrow short tall thin thick clean dirty empty rich poor
safe dangerous sharp smooth rough sweet sour fresh wet dry busy lazy kind proud gentle honest lucky
very really always never often sometimes usually maybe almost already again together quickly slowly soon today
tomorrow yesterday tonight later inside outside above below around between behind before after during through
across against along among toward under within without beyond near far here there where everywhere nowhere
anyone everyone someone nobody something nothing everything anything
one two three four five six seven eight nine ten hundred thousand million first second third half double
`;

export const WORDS_EN: string[] = Array.from(new Set(RAW.split(/\s+/).filter((w) => /^[a-z]+$/.test(w))));
