const CATEGORIES = ['Core', 'People', 'Actions', 'Social', 'Feelings', 'Questions', 'Describing', 'Things'];

// Search terms are intentionally concrete and child-friendly.  The actual
// photographs are provided at runtime by LoremFlickr (Creative-Commons Flickr
// photos).  A deterministic lock keeps each card visually stable between
// sessions instead of showing a different photo on every refresh.
const IMAGE_QUERIES = {
  'I': 'child,portrait', 'you': 'person,pointing', 'me': 'child,self', 'my': 'child,belonging',
  'we': 'children,together', 'they': 'people,group', 'he': 'boy,child', 'she': 'girl,child',
  'a': 'one,object', 'the': 'book,reading', 'and': 'together,connection', 'it': 'object,thing',
  'this': 'pointing,object', 'that': 'pointing,distance', 'here': 'location,place', 'there': 'distance,place',
  'in': 'inside,box', 'on': 'object,table', 'with': 'friends,together', 'not': 'stop,no',

  'mom': 'mother,child', 'dad': 'father,child', 'friend': 'children,friends', 'teacher': 'teacher,classroom',

  'want': 'child,reaching', 'need': 'help,request', 'like': 'thumbs,up', 'love': 'heart,love',
  'have': 'holding,object', 'go': 'walking,forward', 'come': 'walking,toward', 'stop': 'stop,sign',
  'help': 'helping,hands', 'give': 'giving,gift', 'get': 'receiving,object', 'make': 'craft,making',
  'play': 'children,playing', 'eat': 'child,eating', 'drink': 'child,drinking', 'see': 'eyes,looking',
  'hear': 'ear,listening', 'look': 'looking,eyes', 'read': 'child,reading', 'write': 'child,writing',
  'open': 'open,door', 'close': 'closed,door', 'sit': 'child,sitting', 'stand': 'child,standing',
  'sleep': 'child,sleeping', 'wash': 'washing,hands', 'wait': 'waiting,child', 'can': 'child,success',
  'feel': 'child,emotion',

  'hello': 'waving,hello', 'bye': 'waving,goodbye', 'please': 'child,asking', 'thank you': 'thankful,smile',
  'sorry': 'apology,child', 'yes': 'yes,thumbs', 'no': 'no,stop', 'okay': 'okay,thumbs',

  'happy': 'happy,child', 'sad': 'sad,child', 'angry': 'angry,child', 'scared': 'scared,child',
  'tired': 'tired,child', 'sick': 'sick,child', 'hurt': 'injury,bandage', 'good': 'happy,thumbs', 'bad': 'sad,thumbs',

  'what': 'question,child', 'where': 'map,location', 'who': 'people,question', 'why': 'thinking,child',
  'how': 'thinking,question', 'more': 'more,food', 'again': 'repeat,play', 'all done': 'finished,empty',

  'big': 'elephant,big', 'small': 'mouse,small', 'hot': 'hot,steam', 'cold': 'ice,cold',
  'fast': 'running,fast', 'slow': 'turtle,slow',

  'water': 'glass,water', 'food': 'meal,food', 'toilet': 'toilet,bathroom', 'home': 'house,home',
  'school': 'school,building', 'book': 'book,reading', 'ball': 'football,ball', 'cat': 'cat,pet',
  'dog': 'dog,pet', 'toy': 'child,toy', 'phone': 'smartphone,phone', 'bag': 'schoolbag,backpack',
  'shoes': 'shoes,sneakers', 'hand': 'human,hand', 'foot': 'human,foot', 'head': 'child,head',
};

function stableLock(label) {
  let value = 17;
  for (const ch of label) value = (value * 31 + ch.charCodeAt(0)) % 100000;
  return Math.max(1, value);
}

function internetImage(label) {
  const query = IMAGE_QUERIES[label] || label;
  const encoded = encodeURIComponent(query).replace(/%2C/g, ',');
  return `https://loremflickr.com/360/360/${encoded}?lock=${stableLock(label)}`;
}

const make = (label, emoji, category, extra = {}) => ({
  id: `word-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  label,
  spoken: label,
  emoji,
  category,
  image: internetImage(label),
  imageSource: 'LoremFlickr / Flickr Creative Commons',
  ...extra,
});

const BUILT_IN_WORDS = [
  make('I','🙋','Core',{coreFocus:true}), make('you','👉','Core',{coreFocus:true}), make('me','🙂','Core',{coreFocus:true}), make('my','🫶','Core',{coreFocus:true}),
  make('we','👥','Core'), make('they','👥','Core'), make('he','👦','Core'), make('she','👧','Core'),
  make('a','🔹','Core'), make('the','🔷','Core'), make('and','➕','Core',{coreFocus:true}), make('it','📍','Core'), make('this','👇','Core'), make('that','👉','Core'),
  make('here','📌','Core'), make('there','➡️','Core'), make('in','📥','Core'), make('on','⬆️','Core'), make('with','🤝','Core'), make('not','🚫','Core',{coreFocus:true}),

  make('mom','👩','People'), make('dad','👨','People'), make('friend','🧑‍🤝‍🧑','People'), make('teacher','🧑‍🏫','People'),

  make('want','🙌','Actions',{coreFocus:true}), make('need','❗','Actions',{coreFocus:true}), make('like','👍','Actions',{coreFocus:true}), make('love','❤️','Actions'),
  make('have','🤲','Actions'), make('go','➡️','Actions',{coreFocus:true}), make('come','⬅️','Actions'), make('stop','🛑','Actions',{coreFocus:true}), make('help','🆘','Actions',{coreFocus:true}),
  make('give','🎁','Actions'), make('get','🤲','Actions'), make('make','🛠️','Actions'), make('play','🧩','Actions'), make('eat','🍽️','Actions'), make('drink','🥤','Actions'),
  make('see','👀','Actions'), make('hear','👂','Actions'), make('look','🔎','Actions'), make('read','📖','Actions'), make('write','✏️','Actions'), make('open','📂','Actions'),
  make('close','📕','Actions'), make('sit','🪑','Actions'), make('stand','🧍','Actions'), make('sleep','😴','Actions'), make('wash','🧼','Actions'), make('wait','⏳','Actions'),
  make('can','💪','Actions',{coreFocus:true}), make('feel','💭','Actions',{coreFocus:true}),

  make('hello','👋','Social'), make('bye','👋','Social'), make('please','🙏','Social',{coreFocus:true}), make('thank you','💛','Social'), make('sorry','🤝','Social'),
  make('yes','✅','Social',{coreFocus:true}), make('no','❌','Social',{coreFocus:true}), make('okay','👌','Social'),

  make('happy','😊','Feelings',{coreFocus:true}), make('sad','😢','Feelings',{coreFocus:true}), make('angry','😠','Feelings',{coreFocus:true}), make('scared','😨','Feelings',{coreFocus:true}),
  make('tired','🥱','Feelings'), make('sick','🤒','Feelings'), make('hurt','🤕','Feelings',{coreFocus:true}), make('good','🙂','Feelings'), make('bad','🙁','Feelings'),

  make('what','❓','Questions',{coreFocus:true}), make('where','🗺️','Questions',{coreFocus:true}), make('who','👤❓','Questions'), make('why','💭❓','Questions'), make('how','⚙️❓','Questions'),
  make('more','➕','Questions',{coreFocus:true}), make('again','🔁','Questions'), make('all done','✅','Questions',{coreFocus:true}),

  make('big','🐘','Describing'), make('small','🐭','Describing'), make('hot','🔥','Describing'), make('cold','❄️','Describing'), make('fast','⚡','Describing'), make('slow','🐢','Describing'),

  make('water','💧','Things',{coreFocus:true}), make('food','🍎','Things',{coreFocus:true}), make('toilet','🚻','Things',{coreFocus:true}), make('home','🏠','Things'), make('school','🏫','Things'),
  make('book','📚','Things'), make('ball','⚽','Things'), make('cat','🐱','Things'), make('dog','🐶','Things'), make('toy','🧸','Things'), make('phone','📱','Things'),
  make('bag','🎒','Things'), make('shoes','👟','Things'), make('hand','✋','Things'), make('foot','🦶','Things'), make('head','🙂','Things'),
];

const QUICK_PHRASES = [
  { name: 'I want water', icon: '💧', words: ['I','want','water'] },
  { name: 'I need help', icon: '🆘', words: ['I','need','help'] },
  { name: 'I feel sick', icon: '🤒', words: ['I','feel','sick'] },
  { name: 'Where toilet?', icon: '🚻', words: ['where','toilet'] },
  { name: 'All done', icon: '✅', words: ['all done'] },
];

const NEXT_WORDS = {
  i: ['want','need','like','feel','can','have','go'],
  you: ['can','have','go','come','help'],
  want: ['water','food','more','toy','book','go','play'],
  need: ['help','water','food','toilet','more'],
  like: ['play','book','cat','dog','school','food'],
  feel: ['happy','sad','angry','scared','tired','sick','hurt','good','bad'],
  can: ['go','come','help','play','read','write','eat','drink'],
  please: ['help','give','wait','stop'],
  where: ['mom','dad','toilet','home','school','book','ball'],
  more: ['water','food','play'],
  go: ['home','school','toilet'],
  my: ['mom','dad','friend','book','ball','bag','shoes','hand','foot','head'],
};

window.SJ_DATA = { CATEGORIES, BUILT_IN_WORDS, QUICK_PHRASES, NEXT_WORDS };
