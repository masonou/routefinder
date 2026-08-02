export interface Airport {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  region: "Australia" | "Europe";
}

// Curated commercial passenger airports for the first version.  Keep this list
// deliberately readable: countries and then cities are alphabetical.
export const AIRPORTS: Airport[] = [
  // Australia
  { iataCode: "ADL", name: "Adelaide Airport", city: "Adelaide", country: "Australia", region: "Australia" },
  { iataCode: "AVV", name: "Avalon Airport", city: "Avalon", country: "Australia", region: "Australia" },
  { iataCode: "BNE", name: "Brisbane Airport", city: "Brisbane", country: "Australia", region: "Australia" },
  { iataCode: "CNS", name: "Cairns Airport", city: "Cairns", country: "Australia", region: "Australia" },
  { iataCode: "CBR", name: "Canberra Airport", city: "Canberra", country: "Australia", region: "Australia" },
  { iataCode: "DRW", name: "Darwin International Airport", city: "Darwin", country: "Australia", region: "Australia" },
  { iataCode: "HBA", name: "Hobart Airport", city: "Hobart", country: "Australia", region: "Australia" },
  { iataCode: "LST", name: "Launceston Airport", city: "Launceston", country: "Australia", region: "Australia" },
  { iataCode: "MCY", name: "Sunshine Coast Airport", city: "Maroochydore", country: "Australia", region: "Australia" },
  { iataCode: "MEL", name: "Melbourne Airport", city: "Melbourne", country: "Australia", region: "Australia" },
  { iataCode: "NTL", name: "Newcastle Airport", city: "Newcastle", country: "Australia", region: "Australia" },
  { iataCode: "OOL", name: "Gold Coast Airport", city: "Gold Coast", country: "Australia", region: "Australia" },
  { iataCode: "PER", name: "Perth Airport", city: "Perth", country: "Australia", region: "Australia" },
  { iataCode: "SYD", name: "Sydney Airport", city: "Sydney", country: "Australia", region: "Australia" },
  { iataCode: "TSV", name: "Townsville Airport", city: "Townsville", country: "Australia", region: "Australia" },

  // Austria
  { iataCode: "GRZ", name: "Graz Airport", city: "Graz", country: "Austria", region: "Europe" },
  { iataCode: "INN", name: "Innsbruck Airport", city: "Innsbruck", country: "Austria", region: "Europe" },
  { iataCode: "SZG", name: "Salzburg Airport", city: "Salzburg", country: "Austria", region: "Europe" },
  { iataCode: "VIE", name: "Vienna International Airport", city: "Vienna", country: "Austria", region: "Europe" },
  // Belgium
  { iataCode: "BRU", name: "Brussels Airport", city: "Brussels", country: "Belgium", region: "Europe" },
  { iataCode: "CRL", name: "Brussels South Charleroi Airport", city: "Charleroi", country: "Belgium", region: "Europe" },
  // Bulgaria
  { iataCode: "BOJ", name: "Burgas Airport", city: "Burgas", country: "Bulgaria", region: "Europe" },
  { iataCode: "SOF", name: "Sofia Airport", city: "Sofia", country: "Bulgaria", region: "Europe" },
  { iataCode: "VAR", name: "Varna Airport", city: "Varna", country: "Bulgaria", region: "Europe" },
  // Croatia
  { iataCode: "DBV", name: "Dubrovnik Airport", city: "Dubrovnik", country: "Croatia", region: "Europe" },
  { iataCode: "PUY", name: "Pula Airport", city: "Pula", country: "Croatia", region: "Europe" },
  { iataCode: "SPU", name: "Split Airport", city: "Split", country: "Croatia", region: "Europe" },
  { iataCode: "ZAG", name: "Zagreb Airport", city: "Zagreb", country: "Croatia", region: "Europe" },
  // Cyprus
  { iataCode: "LCA", name: "Larnaca International Airport", city: "Larnaca", country: "Cyprus", region: "Europe" },
  { iataCode: "PFO", name: "Paphos International Airport", city: "Paphos", country: "Cyprus", region: "Europe" },
  // Czechia
  { iataCode: "PRG", name: "Václav Havel Airport Prague", city: "Prague", country: "Czechia", region: "Europe" },
  // Denmark
  { iataCode: "AAL", name: "Aalborg Airport", city: "Aalborg", country: "Denmark", region: "Europe" },
  { iataCode: "BLL", name: "Billund Airport", city: "Billund", country: "Denmark", region: "Europe" },
  { iataCode: "CPH", name: "Copenhagen Airport", city: "Copenhagen", country: "Denmark", region: "Europe" },
  // Estonia
  { iataCode: "TLL", name: "Tallinn Airport", city: "Tallinn", country: "Estonia", region: "Europe" },
  // Finland
  { iataCode: "HEL", name: "Helsinki Airport", city: "Helsinki", country: "Finland", region: "Europe" },
  { iataCode: "RVN", name: "Rovaniemi Airport", city: "Rovaniemi", country: "Finland", region: "Europe" },
  // France
  { iataCode: "BOD", name: "Bordeaux Airport", city: "Bordeaux", country: "France", region: "Europe" },
  { iataCode: "LYS", name: "Lyon–Saint Exupéry Airport", city: "Lyon", country: "France", region: "Europe" },
  { iataCode: "MRS", name: "Marseille Provence Airport", city: "Marseille", country: "France", region: "Europe" },
  { iataCode: "NCE", name: "Nice Côte d’Azur Airport", city: "Nice", country: "France", region: "Europe" },
  { iataCode: "CDG", name: "Paris Charles de Gaulle Airport", city: "Paris", country: "France", region: "Europe" },
  { iataCode: "ORY", name: "Paris Orly Airport", city: "Paris", country: "France", region: "Europe" },
  { iataCode: "TLS", name: "Toulouse–Blagnac Airport", city: "Toulouse", country: "France", region: "Europe" },
  // Germany
  { iataCode: "BER", name: "Berlin Brandenburg Airport", city: "Berlin", country: "Germany", region: "Europe" },
  { iataCode: "CGN", name: "Cologne Bonn Airport", city: "Cologne", country: "Germany", region: "Europe" },
  { iataCode: "DUS", name: "Düsseldorf Airport", city: "Düsseldorf", country: "Germany", region: "Europe" },
  { iataCode: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", region: "Europe" },
  { iataCode: "HAM", name: "Hamburg Airport", city: "Hamburg", country: "Germany", region: "Europe" },
  { iataCode: "MUC", name: "Munich Airport", city: "Munich", country: "Germany", region: "Europe" },
  { iataCode: "STR", name: "Stuttgart Airport", city: "Stuttgart", country: "Germany", region: "Europe" },
  // Greece
  { iataCode: "ATH", name: "Athens International Airport", city: "Athens", country: "Greece", region: "Europe" },
  { iataCode: "CFU", name: "Corfu International Airport", city: "Corfu", country: "Greece", region: "Europe" },
  { iataCode: "HER", name: "Heraklion International Airport", city: "Heraklion", country: "Greece", region: "Europe" },
  { iataCode: "JTR", name: "Santorini Airport", city: "Santorini", country: "Greece", region: "Europe" },
  { iataCode: "SKG", name: "Thessaloniki Airport", city: "Thessaloniki", country: "Greece", region: "Europe" },
  // Hungary
  { iataCode: "BUD", name: "Budapest Ferenc Liszt International Airport", city: "Budapest", country: "Hungary", region: "Europe" },
  // Ireland
  { iataCode: "ORK", name: "Cork Airport", city: "Cork", country: "Ireland", region: "Europe" },
  { iataCode: "DUB", name: "Dublin Airport", city: "Dublin", country: "Ireland", region: "Europe" },
  { iataCode: "SNN", name: "Shannon Airport", city: "Shannon", country: "Ireland", region: "Europe" },
  // Italy
  { iataCode: "BLQ", name: "Bologna Guglielmo Marconi Airport", city: "Bologna", country: "Italy", region: "Europe" },
  { iataCode: "CTA", name: "Catania–Fontanarossa Airport", city: "Catania", country: "Italy", region: "Europe" },
  { iataCode: "MXP", name: "Milan Malpensa Airport", city: "Milan", country: "Italy", region: "Europe" },
  { iataCode: "LIN", name: "Milan Linate Airport", city: "Milan", country: "Italy", region: "Europe" },
  { iataCode: "NAP", name: "Naples International Airport", city: "Naples", country: "Italy", region: "Europe" },
  { iataCode: "FCO", name: "Rome Fiumicino Airport", city: "Rome", country: "Italy", region: "Europe" },
  { iataCode: "VCE", name: "Venice Marco Polo Airport", city: "Venice", country: "Italy", region: "Europe" },
  // Latvia
  { iataCode: "RIX", name: "Riga International Airport", city: "Riga", country: "Latvia", region: "Europe" },
  // Lithuania
  { iataCode: "VNO", name: "Vilnius Airport", city: "Vilnius", country: "Lithuania", region: "Europe" },
  // Netherlands
  { iataCode: "AMS", name: "Amsterdam Airport Schiphol", city: "Amsterdam", country: "Netherlands", region: "Europe" },
  { iataCode: "EIN", name: "Eindhoven Airport", city: "Eindhoven", country: "Netherlands", region: "Europe" },
  { iataCode: "RTM", name: "Rotterdam The Hague Airport", city: "Rotterdam", country: "Netherlands", region: "Europe" },
  // Norway
  { iataCode: "BGO", name: "Bergen Airport", city: "Bergen", country: "Norway", region: "Europe" },
  { iataCode: "OSL", name: "Oslo Airport", city: "Oslo", country: "Norway", region: "Europe" },
  { iataCode: "TRD", name: "Trondheim Airport", city: "Trondheim", country: "Norway", region: "Europe" },
  // Poland
  { iataCode: "GDN", name: "Gdańsk Lech Wałęsa Airport", city: "Gdańsk", country: "Poland", region: "Europe" },
  { iataCode: "KRK", name: "Kraków John Paul II International Airport", city: "Kraków", country: "Poland", region: "Europe" },
  { iataCode: "WAW", name: "Warsaw Chopin Airport", city: "Warsaw", country: "Poland", region: "Europe" },
  { iataCode: "WRO", name: "Wrocław Airport", city: "Wrocław", country: "Poland", region: "Europe" },
  // Portugal
  { iataCode: "FAO", name: "Faro Airport", city: "Faro", country: "Portugal", region: "Europe" },
  { iataCode: "FNC", name: "Madeira Airport", city: "Funchal", country: "Portugal", region: "Europe" },
  { iataCode: "LIS", name: "Humberto Delgado Airport", city: "Lisbon", country: "Portugal", region: "Europe" },
  { iataCode: "OPO", name: "Francisco Sá Carneiro Airport", city: "Porto", country: "Portugal", region: "Europe" },
  // Romania
  { iataCode: "OTP", name: "Henri Coandă International Airport", city: "Bucharest", country: "Romania", region: "Europe" },
  { iataCode: "CLJ", name: "Cluj Avram Iancu International Airport", city: "Cluj-Napoca", country: "Romania", region: "Europe" },
  // Serbia
  { iataCode: "BEG", name: "Belgrade Nikola Tesla Airport", city: "Belgrade", country: "Serbia", region: "Europe" },
  // Spain
  { iataCode: "ALC", name: "Alicante–Elche Airport", city: "Alicante", country: "Spain", region: "Europe" },
  { iataCode: "BCN", name: "Barcelona–El Prat Airport", city: "Barcelona", country: "Spain", region: "Europe" },
  { iataCode: "BIO", name: "Bilbao Airport", city: "Bilbao", country: "Spain", region: "Europe" },
  { iataCode: "IBZ", name: "Ibiza Airport", city: "Ibiza", country: "Spain", region: "Europe" },
  { iataCode: "MAD", name: "Adolfo Suárez Madrid–Barajas Airport", city: "Madrid", country: "Spain", region: "Europe" },
  { iataCode: "AGP", name: "Málaga Airport", city: "Málaga", country: "Spain", region: "Europe" },
  { iataCode: "PMI", name: "Palma de Mallorca Airport", city: "Palma", country: "Spain", region: "Europe" },
  { iataCode: "SVQ", name: "Seville Airport", city: "Seville", country: "Spain", region: "Europe" },
  { iataCode: "VLC", name: "Valencia Airport", city: "Valencia", country: "Spain", region: "Europe" },
  // Sweden
  { iataCode: "ARN", name: "Stockholm Arlanda Airport", city: "Stockholm", country: "Sweden", region: "Europe" },
  { iataCode: "GOT", name: "Göteborg Landvetter Airport", city: "Gothenburg", country: "Sweden", region: "Europe" },
  { iataCode: "MMX", name: "Malmö Airport", city: "Malmö", country: "Sweden", region: "Europe" },
  // Switzerland
  { iataCode: "BSL", name: "EuroAirport Basel Mulhouse Freiburg", city: "Basel", country: "Switzerland", region: "Europe" },
  { iataCode: "GVA", name: "Geneva Airport", city: "Geneva", country: "Switzerland", region: "Europe" },
  { iataCode: "ZRH", name: "Zurich Airport", city: "Zurich", country: "Switzerland", region: "Europe" },
  // Turkey
  { iataCode: "AYT", name: "Antalya Airport", city: "Antalya", country: "Turkey", region: "Europe" },
  { iataCode: "ESB", name: "Esenboğa Airport", city: "Ankara", country: "Turkey", region: "Europe" },
  { iataCode: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Turkey", region: "Europe" },
  { iataCode: "SAW", name: "Sabiha Gökçen International Airport", city: "Istanbul", country: "Turkey", region: "Europe" },
  { iataCode: "IZM", name: "Izmir Adnan Menderes Airport", city: "Izmir", country: "Turkey", region: "Europe" },
  // United Kingdom
  { iataCode: "BHD", name: "George Best Belfast City Airport", city: "Belfast", country: "United Kingdom", region: "Europe" },
  { iataCode: "BRS", name: "Bristol Airport", city: "Bristol", country: "United Kingdom", region: "Europe" },
  { iataCode: "EDI", name: "Edinburgh Airport", city: "Edinburgh", country: "United Kingdom", region: "Europe" },
  { iataCode: "GLA", name: "Glasgow Airport", city: "Glasgow", country: "United Kingdom", region: "Europe" },
  { iataCode: "LHR", name: "London Heathrow Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "LGW", name: "London Gatwick Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "LCY", name: "London City Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "LTN", name: "London Luton Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "STN", name: "London Stansted Airport", city: "London", country: "United Kingdom", region: "Europe" },
  { iataCode: "MAN", name: "Manchester Airport", city: "Manchester", country: "United Kingdom", region: "Europe" },
  { iataCode: "NCL", name: "Newcastle International Airport", city: "Newcastle", country: "United Kingdom", region: "Europe" },
];

export function findAirportByCode(code: string): Airport | undefined {
  const normalisedCode = code.trim().toUpperCase();
  return AIRPORTS.find((airport) => airport.iataCode === normalisedCode);
}
