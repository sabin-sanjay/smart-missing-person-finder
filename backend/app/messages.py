"""
messages.py: the words in every push notification, in five languages.

Each phone's language is saved with its alert subscription (supabase/013).
Use:  text("found_title", "ta", name="Sai")
Anything missing in a language falls back to English.
SMS stays in plain English on purpose: other scripts make each SMS cost more.
"""

LANGS = ("en", "hi", "ta", "ml", "te")

T = {
    "en": {
        "msg_police_title": "💬 Police update about {name}",
        "msg_family_title": "💬 Message from {name}'s family",
        "alert_title": "🚨 Missing: {name}",
        "alert_body": "Last seen {ago}{place}, {km} km from you. Tap to see the photo or report a sighting.",
        "near": " near {place}",
        "min": "{n} min ago", "hours": "{n} hours ago", "hour": "1 hour ago", "days": "{n} days ago", "day": "1 day ago",
        "found_title": "🎉 {name} has been found",
        "found_body": "Thank you for helping. Alerts for this case have stopped.",
        "sighting_title": "👀 Someone reported seeing {name}",
        "sighting_body": "The police have the details and are checking it now.",
        "match_finder_title": "🔎 Possible match for the person you found",
        "match_finder_body": "They may be {name} ({pct}% face match). Police have been told.",
        "match_police_title": "🔎 Found person may be {name}",
        "match_police_body": "{pct}% face match with a registered missing person. Please check.",
    },
    "hi": {
        "msg_police_title": "💬 {name} के बारे में पुलिस का संदेश",
        "msg_family_title": "💬 {name} के परिवार का संदेश",
        "alert_title": "🚨 लापता: {name}",
        "alert_body": "आख़िरी बार {ago}{place} देखा गया, आपसे {km} कि.मी. दूर। फ़ोटो देखने या सूचना देने के लिए टैप करें।",
        "near": " {place} के पास",
        "min": "{n} मिनट पहले", "hours": "{n} घंटे पहले", "hour": "1 घंटा पहले", "days": "{n} दिन पहले", "day": "1 दिन पहले",
        "found_title": "🎉 {name} मिल गए हैं",
        "found_body": "मदद के लिए धन्यवाद। इस मामले के अलर्ट बंद कर दिए गए हैं।",
        "sighting_title": "👀 किसी ने {name} को देखने की सूचना दी",
        "sighting_body": "पुलिस के पास विवरण है और वह अभी इसकी जाँच कर रही है।",
        "match_finder_title": "🔎 आपको मिले व्यक्ति का संभावित मिलान",
        "match_finder_body": "वे {name} हो सकते हैं ({pct}% चेहरा मिलान)। पुलिस को बता दिया गया है।",
        "match_police_title": "🔎 मिला व्यक्ति {name} हो सकता है",
        "match_police_body": "दर्ज लापता व्यक्ति से {pct}% चेहरा मिलान। कृपया जाँचें।",
    },
    "ta": {
        "msg_police_title": "💬 {name} பற்றி காவல்துறையின் செய்தி",
        "msg_family_title": "💬 {name} இன் குடும்பத்திடமிருந்து செய்தி",
        "alert_title": "🚨 காணவில்லை: {name}",
        "alert_body": "கடைசியாக {ago}{place} பார்க்கப்பட்டார், உங்களிடமிருந்து {km} கி.மீ. புகைப்படத்தைப் பார்க்க அல்லது தெரிவிக்கத் தொடவும்.",
        "near": " {place} அருகில்",
        "min": "{n} நிமிடம் முன்", "hours": "{n} மணி நேரம் முன்", "hour": "1 மணி நேரம் முன்", "days": "{n} நாட்கள் முன்", "day": "1 நாள் முன்",
        "found_title": "🎉 {name} கண்டுபிடிக்கப்பட்டார்",
        "found_body": "உதவியதற்கு நன்றி. இந்த வழக்கிற்கான எச்சரிக்கைகள் நிறுத்தப்பட்டன.",
        "sighting_title": "👀 {name} ஐப் பார்த்ததாக ஒருவர் தெரிவித்துள்ளார்",
        "sighting_body": "காவல்துறையிடம் விவரங்கள் உள்ளன, இப்போது சரிபார்க்கிறார்கள்.",
        "match_finder_title": "🔎 நீங்கள் கண்டவருக்குப் பொருத்தம் இருக்கலாம்",
        "match_finder_body": "அவர் {name} ஆக இருக்கலாம் ({pct}% முகப் பொருத்தம்). காவல்துறைக்குத் தெரிவிக்கப்பட்டது.",
        "match_police_title": "🔎 கண்டெடுக்கப்பட்டவர் {name} ஆக இருக்கலாம்",
        "match_police_body": "பதிவான காணாமல் போனவருடன் {pct}% முகப் பொருத்தம். சரிபார்க்கவும்.",
    },
    "ml": {
        "msg_police_title": "💬 {name} നെക്കുറിച്ച് പോലീസിന്റെ സന്ദേശം",
        "msg_family_title": "💬 {name} ന്റെ കുടുംബത്തിൽ നിന്നുള്ള സന്ദേശം",
        "alert_title": "🚨 കാണാനില്ല: {name}",
        "alert_body": "അവസാനം കണ്ടത് {ago}{place}, നിങ്ങളിൽ നിന്ന് {km} കി.മീ. ഫോട്ടോ കാണാനോ അറിയിക്കാനോ ടാപ്പ് ചെയ്യുക.",
        "near": " {place} ന് സമീപം",
        "min": "{n} മിനിറ്റ് മുമ്പ്", "hours": "{n} മണിക്കൂർ മുമ്പ്", "hour": "1 മണിക്കൂർ മുമ്പ്", "days": "{n} ദിവസം മുമ്പ്", "day": "1 ദിവസം മുമ്പ്",
        "found_title": "🎉 {name} കണ്ടെത്തി",
        "found_body": "സഹായിച്ചതിന് നന്ദി. ഈ കേസിന്റെ മുന്നറിയിപ്പുകൾ നിർത്തി.",
        "sighting_title": "👀 {name} നെ കണ്ടതായി ഒരാൾ അറിയിച്ചു",
        "sighting_body": "പോലീസിന് വിവരങ്ങൾ ലഭിച്ചു, ഇപ്പോൾ പരിശോധിക്കുന്നു.",
        "match_finder_title": "🔎 നിങ്ങൾ കണ്ടെത്തിയ ആൾക്ക് സാധ്യമായ പൊരുത്തം",
        "match_finder_body": "അവർ {name} ആകാം ({pct}% മുഖ പൊരുത്തം). പോലീസിനെ അറിയിച്ചു.",
        "match_police_title": "🔎 കണ്ടെത്തിയ ആൾ {name} ആകാം",
        "match_police_body": "രജിസ്റ്റർ ചെയ്ത കാണാതായ ആളുമായി {pct}% മുഖ പൊരുത്തം. പരിശോധിക്കുക.",
    },
    "te": {
        "msg_police_title": "💬 {name} గురించి పోలీసుల సందేశం",
        "msg_family_title": "💬 {name} కుటుంబం నుండి సందేశం",
        "alert_title": "🚨 తప్పిపోయారు: {name}",
        "alert_body": "చివరిగా {ago}{place} కనిపించారు, మీ నుండి {km} కి.మీ. ఫోటో చూడటానికి లేదా తెలియజేయడానికి నొక్కండి.",
        "near": " {place} సమీపంలో",
        "min": "{n} నిమిషాల క్రితం", "hours": "{n} గంటల క్రితం", "hour": "1 గంట క్రితం", "days": "{n} రోజుల క్రితం", "day": "1 రోజు క్రితం",
        "found_title": "🎉 {name} దొరికారు",
        "found_body": "సహాయం చేసినందుకు ధన్యవాదాలు. ఈ కేసుకు హెచ్చరికలు ఆపబడ్డాయి.",
        "sighting_title": "👀 {name} ని చూసినట్లు ఎవరో తెలియజేశారు",
        "sighting_body": "పోలీసుల వద్ద వివరాలు ఉన్నాయి, ఇప్పుడు తనిఖీ చేస్తున్నారు.",
        "match_finder_title": "🔎 మీకు దొరికిన వ్యక్తికి సరిపోలే అవకాశం",
        "match_finder_body": "వారు {name} కావచ్చు ({pct}% ముఖ సరిపోలిక). పోలీసులకు తెలియజేశాం.",
        "match_police_title": "🔎 దొరికిన వ్యక్తి {name} కావచ్చు",
        "match_police_body": "నమోదైన తప్పిపోయిన వ్యక్తితో {pct}% ముఖ సరిపోలిక. దయచేసి తనిఖీ చేయండి.",
    },
}


def text(key: str, lang: str | None, **values) -> str:
    """The sentence `key` in `lang` (English if missing), with {values} filled in."""
    words = T.get(lang or "en", T["en"]).get(key) or T["en"][key]
    return words.format(**values)


def time_ago(minutes: int, lang: str | None) -> str:
    if minutes < 60:
        return text("min", lang, n=max(minutes, 1))
    hours = minutes // 60
    if hours < 24:
        return text("hour", lang) if hours == 1 else text("hours", lang, n=hours)
    days = hours // 24
    return text("day", lang) if days == 1 else text("days", lang, n=days)
