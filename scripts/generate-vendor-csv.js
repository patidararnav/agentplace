/**
 * Generates vendor_data.csv for Supabase upload.
 * Run: node scripts/generate-vendor-csv.js
 */

import fs from 'fs';

function escapeCsv(str) {
  const s = String(str);
  return '"' + s.replace(/"/g, '""') + '"';
}

const CITIES = [
  { name: 'Atlanta', lat: 33.749, lng: -84.388 },
  { name: 'Austin', lat: 30.2672, lng: -97.7431 },
  { name: 'Denver', lat: 39.7392, lng: -104.9903 },
  { name: 'Seattle', lat: 47.6062, lng: -122.3321 },
  { name: 'Phoenix', lat: 33.4484, lng: -112.074 },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
  { name: 'Boston', lat: 42.3601, lng: -71.0589 },
  { name: 'Miami', lat: 25.7617, lng: -80.1918 },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Dallas', lat: 32.7767, lng: -96.797 },
  { name: 'Portland', lat: 45.5152, lng: -122.6784 },
  { name: 'Nashville', lat: 36.1627, lng: -86.7816 },
  { name: 'Minneapolis', lat: 44.9778, lng: -93.265 },
  { name: 'San Diego', lat: 32.7157, lng: -117.1611 },
  { name: 'Houston', lat: 29.7604, lng: -95.3698 },
  { name: 'Philadelphia', lat: 39.9526, lng: -75.1652 },
  { name: 'Detroit', lat: 42.3314, lng: -83.0458 },
  { name: 'Charlotte', lat: 35.2271, lng: -80.8431 },
];

const WEEKLY_FULL = JSON.stringify({
  monday: ['06:00', '20:00'],
  tuesday: ['06:00', '20:00'],
  wednesday: ['06:00', '20:00'],
  thursday: ['06:00', '20:00'],
  friday: ['06:00', '20:00'],
  saturday: ['08:00', '18:00'],
  sunday: null,
});

const WEEKLY_WEEKDAYS = JSON.stringify({
  monday: ['07:00', '19:00'],
  tuesday: ['07:00', '19:00'],
  wednesday: ['07:00', '19:00'],
  thursday: ['07:00', '19:00'],
  friday: ['07:00', '19:00'],
  saturday: null,
  sunday: null,
});

const WEEKLY_FLEX = JSON.stringify({
  monday: ['09:00', '21:00'],
  tuesday: ['09:00', '21:00'],
  wednesday: ['09:00', '21:00'],
  thursday: ['09:00', '21:00'],
  friday: ['09:00', '21:00'],
  saturday: ['10:00', '18:00'],
  sunday: ['10:00', '16:00'],
});

const WEEKLY_MORNINGS = JSON.stringify({
  monday: ['06:00', '14:00'],
  tuesday: ['06:00', '14:00'],
  wednesday: ['06:00', '14:00'],
  thursday: ['06:00', '14:00'],
  friday: ['06:00', '14:00'],
  saturday: null,
  sunday: null,
});

const AVAILABILITIES = [WEEKLY_FULL, WEEKLY_WEEKDAYS, WEEKLY_FLEX, WEEKLY_MORNINGS];

function rnd(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rndInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function jitter(coord, amt = 0.02) {
  return coord + (Math.random() - 0.5) * amt;
}

// Consumer names: first + last so no single consumer has > 3 jobs
const FIRST = ['James', 'Maria', 'David', 'Sarah', 'Michael', 'Emily', 'Chris', 'Jessica', 'Daniel', 'Ashley', 'Matthew', 'Amanda', 'Andrew', 'Jennifer', 'Joshua', 'Stephanie', 'Ryan', 'Nicole', 'Kevin', 'Elizabeth', 'Brandon', 'Lauren', 'Justin', 'Rachel', 'Tyler', 'Megan', 'Jacob', 'Samantha', 'Nicholas', 'Rebecca', 'Aaron', 'Heather', 'Eric', 'Kimberly', 'Jonathan', 'Christina', 'Nathan', 'Amy', 'Benjamin', 'Angela', 'Samuel', 'Michelle', 'Gregory', 'Melissa', 'Frank', 'Laura', 'Raymond', 'Lisa', 'Patrick', 'Katherine', 'Jack', 'Stephanie', 'Dennis', 'Hannah', 'Jerry', 'Olivia', 'Henry', 'Abigail', 'Carl', 'Emma', 'Arthur', 'Madison', 'Peter', 'Chloe', 'Albert', 'Grace', 'Eugene', 'Victoria', 'Russell', 'Ella', 'Philip', 'Natalie', 'Ralph', 'Alyssa', 'Fred', 'Brianna', 'Roy', 'Sydney', 'Louis', 'Taylor', 'Wayne', 'Kayla', 'Eugene', 'Anna', 'Lawrence', 'Jasmine', 'Harry', 'Alexis', 'Dylan', 'Savannah', 'Jordan', 'Morgan', 'Gabriel', 'Hailey', 'Caleb', 'Faith', 'Ian', 'Alexa', 'Cole', 'Makayla', 'Adrian', 'Katelyn', 'Owen', 'Lily', 'Landon', 'Avery', 'Connor', 'Sophie', 'Carson', 'Claire', 'Hunter', 'Lillian', 'Eli', 'Addison', 'Levi', 'Brooklyn', 'Sebastian', 'Zoe', 'Lincoln', 'Scarlett', 'Mason', 'Audrey', 'Noah', 'Allison', 'Lucas', 'Sadie', 'Miles', 'Skylar', 'Leo', 'Aria', 'Theo', 'Camila', 'Felix', 'Ariana', 'Ezra', 'Quinn', 'Asher', 'Nevaeh', 'Silas', 'Paisley', 'Jasper', 'Ruby', 'Finn', 'Serenity', 'Oscar', 'Willow', 'Max', 'Piper', 'Arlo', 'Layla', 'Elliot', 'Nora', 'Bennett', 'Hazel', 'Wesley', 'Violet', 'Graham', 'Stella', 'Reid', 'Ivy', 'Sawyer', 'Emilia', 'Brooks', 'Lucy', 'Declan', 'Peyton', 'Griffin', 'Bella', 'Brady', 'Natalie', 'Jace', 'Mackenzie', 'Kai', 'Eva', 'Roman', 'Alice', 'Axel', 'Sofia', 'Tristan', 'Charlotte', 'Blake', 'Aurora', 'Damian', 'Vivian', 'Kingston', 'Maya', 'Jax', 'Elena', 'Gavin', 'Luna', 'Bentley', 'Aaliyah', 'Maddox', 'Leilani', 'Easton', 'Adalynn', 'Ryder', 'Kennedy', 'Knox', 'Madelyn', 'Beckett', 'Eleanor', 'Caden', 'Caroline', 'Cooper', 'Genesis', 'Dominic', 'Valentina', 'Tucker', 'Isabelle', 'Colton', 'Nadia', 'Parker', 'Emery', 'Xavier', 'Reagan', 'Hayden', 'Londyn', 'Weston', 'Liliana', 'Brantley', 'Khloe', 'Braxton', 'Alexandra', 'Jett', 'Hadley', 'Kaden', 'Adeline', 'Corbin', 'Jade', 'Gage', 'Rylee', 'Zachary', 'Eden', 'Kyle', 'Margaret', 'Travis', 'Clara', 'Seth', 'Melanie', 'Ivan', 'Jordyn', 'Bryce', 'Jocelyn', 'Grant', 'Payton', 'Maxwell', 'Teagan', 'Micah', 'Lyla', 'Ashton', 'Gianna', 'Nolan', 'Kinsley', 'Cody', 'Mckenzie', 'Preston', 'Kylie', 'Colby', 'Aubrey', 'Devin', 'Mckenna', 'Cameron', 'Reese', 'Jared', 'Bailey', 'Marcus', 'Jenna', 'Garrett', 'Destiny', 'George', 'Marissa', 'Trevor', 'Kelsey', 'Brett', 'Jillian', 'Tanner', 'Diamond', 'Josiah', 'Makenzie', 'Chase', 'Crystal', 'Dustin', 'Haley', 'Edgar', 'Sabrina', 'Spencer', 'Riley', 'Braden', 'Catherine', 'Derek', 'Vanessa', 'Shawn', 'Bianca', 'Erik', 'Juliana', 'Roberto', 'Adriana', 'Darius', 'Gracie', 'Corey', 'Molly', 'Fernando', 'Sierra', 'Andres', 'Ariel', 'Mario', 'Summer', 'Eddie', 'Callie', 'Manuel', 'Gabriella', 'Emmanuel', 'Kate', 'Marco', 'Jade', 'Alberto', 'Daisy', 'Ricardo', 'Lilly', 'Francisco', 'Miranda', 'Enrique', 'Carly', 'Ruben', 'Mia', 'Raul', 'Leah', 'Mauricio', 'Diana', 'Arturo', 'Ana', 'Alfredo', 'Mariah', 'Rafael', 'Jada', 'Antonio', 'Lydia', 'Hector', 'Katie', 'Luis', 'Jenna', 'Diego', 'Brooke', 'Pedro', 'Alexandria', 'Miguel', 'Priscilla', 'Alejandro', 'Monica', 'Jorge', 'Valeria', 'Carlos', 'Daniela', 'Victor', 'Esmeralda', 'Angel', 'Erica', 'Oscar', 'Tiffany', 'Javier', 'Brittany', 'Hugo', 'Lindsey', 'Ignacio', 'Kristen', 'Pablo', 'Paige', 'Sergio', 'Shelby', 'Gustavo', 'Caitlin', 'Lorenzo', 'Hope', 'Eduardo', 'Chelsea', 'Rodrigo', 'Angelica', 'Felipe', 'Brenda', 'Leonardo', 'Lindsay', 'Emilio', 'Kaitlyn', 'Ramon', 'Dana', 'Cesar', 'Dominique', 'Alonso', 'Patricia', 'Gerardo', 'Nancy', 'Guillermo', 'Teresa', 'Humberto', 'Sandra', 'Emanuel', 'Diane', 'Salvador', 'Carmen', 'Vicente', 'Rosa', 'Agustin', 'Linda', 'Rene', 'Karen', 'Esteban', 'Janet', 'Alfredo', 'Donna', 'Federico', 'Carol', 'Gregorio', 'Ruth', 'Leonel', 'Sharon', 'Maximiliano', 'Cynthia', 'Rodolfo', 'Kathleen', 'Rolando', 'Amy', 'Ismael', 'Betty', 'Octavio', 'Dorothy', 'Renato', 'Helen', 'Fabian', 'Deborah', 'Adan', 'Rachel', 'Ernesto', 'Carolyn', 'Gilberto', 'Janice', 'Luciano', 'Maria', 'Noe', 'Heather', 'Tomas', 'Diana', 'Rogelio', 'Julie', 'Abel', 'Olivia', 'Isidro', 'Joyce', 'Moises', 'Virginia', 'Saul', 'Victoria', 'Aldo', 'Kelly', 'Cruz', 'Lauren', 'Guillermo', 'Christina', 'Orlando', 'Joan', 'Erick', 'Evelyn', 'Hernan', 'Judith', 'Marcelino', 'Marilyn', 'Nestor', 'Mildred', 'Pascual', 'Katherine', 'Refugio', 'Emma', 'Reynaldo', 'Frances', 'Santos', 'Ann', 'Valentin', 'Teresa', 'Adolfo', 'Gloria', 'Bernardo', 'Rose', 'Wilfredo', 'Alice', 'Rigoberto', 'Judy', 'Rudy', 'Florence', 'Rusty', 'Jean', 'Sal', 'Edith', 'Vince', 'Dolores', 'Wade', 'Thelma', 'Zane', 'Lucille', 'Dewayne', 'Ethel', 'Darrel', 'Juanita', 'Earle', 'Lorraine', 'Elmer', 'Wanda', 'Merle', 'Gertrude', 'Murray', 'Wilma', 'Virgil', 'Bertha', 'Cleveland', 'Margie', 'Clifford', 'Vera', 'Leland', 'Minnie', 'Sherwood', 'Ida', 'Buford', 'Faye', 'Grover', 'Myrtle', 'Harley', 'Hattie', 'Lamar', 'Inez', 'Lonnie', 'Maude', 'Loyd', 'Blanche', 'Mervin', 'Pearl', 'Norbert', 'Nellie', 'Percy', 'Opal', 'Roosevelt', 'Erma', 'Sterling', 'Lula', 'Thurman', 'Lena', 'Tim', 'Loretta', 'Waldo', 'Mamie', 'Wally', 'Rosie', 'Wilburn', 'Stella', 'Alton', 'Della', 'Archie', 'Mae', 'Barney', 'Lottie', 'Eldon', 'Roxie', 'Garland', 'Ora', 'Linus', 'Effie', 'Omar', 'Goldie', 'Rex', 'Leona', 'Roman', 'Ollie', 'Rudy', 'Janie', 'Sanford', 'Lizzie', 'Teddy', 'Susie', 'Terrell', 'Lydia', 'Vern', 'Nettie', 'Wendell', 'Lola', 'Dudley', 'Dollie', 'Ervin', 'Fannie', 'Forrest', 'Flora', 'Galen', 'Cecelia', 'Garth', 'Cornelia', 'Grady', 'Elvira', 'Harlan', 'Harriett', 'Haywood', 'Lenora', 'Hollis', 'Lilly', 'Houston', 'Melva', 'Hoyt', 'Ola', 'Kirby', 'Lenore', 'Lane', 'Lela', 'Lucien', 'Lorena', 'Lucian', 'Lorna', 'Mason', 'Louella', 'Napoleon', 'Lucinda', 'Nolan', 'Luna', 'Orval', 'Margery', 'Orville', 'Maudie', 'Porter', 'Maybelle', 'Raleigh', 'Mazie', 'Randolph', 'Melvina', 'Raphael', 'Merle', 'Reginald', 'Meta', 'Rupert', 'Millie', 'Seward', 'Molly', 'Shannon', 'Myra', 'Sylvester', 'Neva', 'Thaddeus', 'Nona', 'Theron', 'Norine', 'Titus', 'Octavia', 'Vernon', 'Odessa', 'Wilton', 'Odie', 'Alva', 'Oma', 'Alvina', 'Ona', 'Amie', 'Orpha', 'Antonette', 'Ottilie', 'Ardella', 'Palma', 'Ardith', 'Pansy', 'Ariane', 'Parthenia', 'Audra', 'Pattie', 'Augusta', 'Pennie', 'Aurore', 'Rachael', 'Belva', 'Rae', 'Berna', 'Reva', 'Bernita', 'Rheta', 'Bette', 'Rosalia', 'Bettina', 'Rosalind', 'Birdie', 'Rosamond', 'Blanch', 'Rosanne', 'Catharine', 'Rosia', 'Celestine', 'Rosina', 'Charity', 'Rowena', 'Chasity', 'Roxanna', 'Christene', 'Sabina', 'Clementine', 'Salome', 'Concepcion', 'Sibyl', 'Dagmar', 'Tena', 'Dana', 'Thomasina', 'Delphia', 'Trudie', 'Domenica', 'Verdie', 'Donita', 'Verona', 'Dorthey', 'Vesta', 'Earline', 'Vina', 'Elenor', 'Violette', 'Elisa', 'Virgie', 'Elouise', 'Zelma', 'Elvera', 'Zena', 'Elyse', 'Zola', 'Ethelyn', 'Zora', 'Evalyn', 'Zula', 'Evangeline', 'Zelda', 'Fae', 'Zella', 'Ferne', 'Zenobia', 'Florine', 'Zeta', 'Freda', 'Zona', 'Garnet', 'Zelda', 'Gayle', 'Almeta', 'Georgette', 'Almina', 'Gilda', 'Almira', 'Gretchen', 'Alphonsine', 'Griselda', 'Alverta', 'Gussie', 'Alyce', 'Hanna', 'Alysa', 'Hassie', 'Alyssa', 'Hortense', 'Amberly', 'Icie', 'Amie', 'Icy', 'Anastacia', 'Illa', 'Andra', 'Imogene', 'Ardath', 'Ione', 'Ardelia', 'Iris', 'Ardelle', 'Ivory', 'Ardeth', 'Jacinthe', 'Ardis', 'Jacquelyn', 'Ardith', 'Jammie', 'Arla', 'Janell', 'Arleen', 'Janessa', 'Arlena', 'Janice', 'Arletta', 'Janis', 'Arlie', 'Jannette', 'Arlyne', 'Jeanette', 'Armida', 'Jenifer', 'Arnita', 'Jennette', 'Arthur', 'Jerri', 'Audie', 'Jettie', 'Audry', 'Jewel', 'Aurore', 'Jewell', 'Avelina', 'Jill', 'Avery', 'Jodie', 'Barbra', 'Jolene', 'Beaulah', 'Jordyn', 'Belle', 'Josiephine', 'Belva', 'Juanita', 'Berdie', 'Juliana', 'Bernardine', 'Juliet', 'Bernetta', 'Junie', 'Bertie', 'Kacey', 'Bette', 'Kaitlin', 'Beula', 'Kallie', 'Blossom', 'Kandy', 'Bulah', 'Karan', 'Burnice', 'Karis', 'Camilla', 'Karissa', 'Candace', 'Kassandra', 'Candice', 'Katelynn', 'Carlee', 'Katharina', 'Carlene', 'Katheryn', 'Carolina', 'Katlyn', 'Carrie', 'Kaycee', 'Cathrine', 'Kaylee', 'Cecile', 'Keeley', 'Celesta', 'Kelli', 'Celestina', 'Kelsi', 'Chanel', 'Kenia', 'Channie', 'Kenna', 'Charleen', 'Kennedi', 'Charline', 'Keri', 'Chasity', 'Kesha', 'Chelsie', 'Kiana', 'Cherry', 'Kiarra', 'Cheryl', 'Kiley', 'Chrystal', 'Kimber', 'Cinda', 'Kirsten', 'Claribel', 'Kyla', 'Clarice', 'Kylee', 'Classie', 'Kylene', 'Clemmie', 'Kylie', 'Clotilde', 'Lacey', 'Coleen', 'Laci', 'Connie', 'Lacy', 'Corine', 'Lakisha', 'Corrine', 'Lana', 'Courtney', 'Laney', 'Cristal', 'Larissa', 'Cristen', 'Latasha', 'Cristina', 'Latisha', 'Cruz', 'Latoya', 'Dagmar', 'Laureen', 'Daina', 'Lavada', 'Dale', 'Lavonne', 'Damaris', 'Lea', 'Danae', 'Leann', 'Danica', 'Leanna', 'Daniele', 'Leatha', 'Danika', 'Leilani', 'Dannie', 'Lelia', 'Danyel', 'Lenna', 'Danyell', 'Leola', 'Danyelle', 'Leona', 'Darcel', 'Leone', 'Darlene', 'Leonie', 'Daryl', 'Leora', 'Deana', 'Lesa', 'Deann', 'Lesley', 'Deanne', 'Letha', 'Debbra', 'Lexie', 'Debi', 'Lia', 'Debrah', 'Liana', 'Debroah', 'Libby', 'Dedra', 'Lidia', 'Deedee', 'Lila', 'Deidra', 'Lilia', 'Deirdre', 'Liliana', 'Delaine', 'Lilla', 'Delcie', 'Lina', 'Delila', 'Linda', 'Delinda', 'Lindsay', 'Dell', 'Lindsey', 'Della', 'Lindy', 'Delma', 'Linnea', 'Delois', 'Lise', 'Delora', 'Liz', 'Delores', 'Liza', 'Deloris', 'Lizbeth', 'Demetria', 'Lizeth', 'Dena', 'Lizette', 'Denice', 'Lizzette', 'Denise', 'Loida', 'Denisse', 'Lola', 'Desirae', 'Lolita', 'Desiree', 'Loma', 'Destiny', 'Lona', 'Devin', 'Loni', 'Devon', 'Loreen', 'Devona', 'Loren', 'Devora', 'Lorena', 'Devorah', 'Lorine', 'Diamond', 'Lorri', 'Dian', 'Lorrie', 'Diana', 'Lottie', 'Diann', 'Lou', 'Dianna', 'Louann', 'Dianne', 'Louella', 'Dina', 'Louie', 'Dinah', 'Louis', 'Dionne', 'Louisa', 'Dollie', 'Louise', 'Dolly', 'Lourdes', 'Dolores', 'Love', 'Dominique', 'Lovella', 'Donita', 'Lovie', 'Dora', 'Luci', 'Dorathy', 'Lucie', 'Dorcas', 'Lucienne', 'Doreen', 'Lucila', 'Dorene', 'Lucile', 'Doretha', 'Lucinda', 'Dorinda', 'Lucretia', 'Dorine', 'Lucy', 'Dorotha', 'Ludie', 'Dorothea', 'Lue', 'Dorothy', 'Luella', 'Dortha', 'Lula', 'Drew', 'Lulu', 'Earleen', 'Luna', 'Earlene', 'Luz', 'Earline', 'Lyda', 'Easter', 'Lyn', 'Eboni', 'Lynda', 'Ebonie', 'Lynette', 'Echo', 'Lynn', 'Eda', 'Lynne', 'Edda', 'Lynnette', 'Edie', 'Mabel', 'Edwina', 'Mabelle', 'Edythe', 'Macy', 'Effie', 'Madaline', 'Eileen', 'Madalyn', 'Elaina', 'Maddison', 'Elaine', 'Mae', 'Elana', 'Maegan', 'Eleanor', 'Magdalena', 'Eleanore', 'Magdalen', 'Elena', 'Maggie', 'Elfreda', 'Malinda', 'Elia', 'Malissa', 'Elida', 'Mallory', 'Elinor', 'Mandy', 'Elisa', 'Manuela', 'Elisabeth', 'Mara', 'Elise', 'Marcela', 'Elissa', 'Marcella', 'Eliza', 'Marcia', 'Elizabeth', 'Margarette', 'Ella', 'Margarita', 'Ellamae', 'Margie', 'Ellen', 'Margot', 'Ellie', 'Margret', 'Elma', 'Marguerite', 'Elmira', 'Mari', 'Elna', 'Maria', 'Elnora', 'Mariana', 'Elodia', 'Mariann', 'Elouise', 'Marianne', 'Elsa', 'Maribel', 'Else', 'Maribeth', 'Elsie', 'Marie', 'Elvera', 'Mariel', 'Elvia', 'Mariela', 'Elvira', 'Marietta', 'Elyse', 'Marilee', 'Ema', 'Marilou', 'Emelia', 'Marilyn', 'Emeline', 'Marina', 'Emely', 'Marinda', 'Emerald', 'Marisa', 'Emilee', 'Marisol', 'Emilia', 'Marissa', 'Emilie', 'Marita', 'Emily', 'Maritza', 'Emma', 'Marlena', 'Emmie', 'Marley', 'Ena', 'Marlene', 'Enola', 'Marquita', 'Era', 'Marry', 'Ericka', 'Marsha', 'Erika', 'Marta', 'Erma', 'Martha', 'Erna', 'Martina', 'Ernestine', 'Marvel', 'Esperanza', 'Mary', 'Essie', 'Maryann', 'Estell', 'Maryanne', 'Estella', 'Maryellen', 'Estelle', 'Maryjane', 'Ethel', 'Marylin', 'Ethelyn', 'Marylou', 'Ethyl', 'Mathilda', 'Etta', 'Matilda', 'Eufemia', 'Mattie', 'Eula', 'Maud', 'Eulalia', 'Maude', 'Euna', 'Maudie', 'Euphemia', 'Maura', 'Eusebia', 'Maxine', 'Eva', 'May', 'Evalyn', 'Maybelle', 'Eve', 'Maye', 'Evelina', 'Mayme', 'Eveline', 'Meg', 'Evelyn', 'Megan', 'Everlena', 'Melba', 'Evette', 'Melinda', 'Evie', 'Melissa', 'Evita', 'Melodee', 'Evon', 'Melodie', 'Evonne', 'Melody', 'Exie', 'Mercedes', 'Fabiola', 'Merilyn', 'Fae', 'Merissa', 'Fairy', 'Merrill', 'Fallon', 'Meryl', 'Fannie', 'Meta', 'Fanny', 'Mia', 'Fatima', 'Micaela', 'Faustina', 'Michele', 'Faviola', 'Michelle', 'Fay', 'Mickey', 'Felecia', 'Mikki', 'Felicia', 'Milagros', 'Felicity', 'Millicent', 'Fern', 'Mimi', 'Fernanda', 'Minerva', 'Fidelia', 'Minnie', 'Flor', 'Minta', 'Flora', 'Mira', 'Florance', 'Miranda', 'Florence', 'Miriam', 'Florine', 'Misty', 'Flossie', 'Mitzi', 'Fonda', 'Modesta', 'Fran', 'Moira', 'Francene', 'Mollie', 'Frances', 'Molly', 'Francesca', 'Monica', 'Francine', 'Monika', 'Frankie', 'Monique', 'Freda', 'Moon', 'Fredda', 'Morgan', 'Freddie', 'Mozell', 'Freida', 'Mozella', 'Frida', 'Muriel', 'Gabriela', 'Myra', 'Gabriella', 'Myrna', 'Gabrielle', 'Nadia', 'Gail', 'Nakia', 'Gale', 'Nan', 'Garnet', 'Nanci', 'Gay', 'Nancie', 'Gaye', 'Nanette', 'Gayla', 'Nannette', 'Gayle', 'Naomi', 'Gena', 'Narcissa', 'Geneva', 'Natasha', 'Genevieve', 'Nathalie', 'Genoveva', 'Nell', 'Georgann', 'Nella', 'Georgeann', 'Nellie', 'Georgene', 'Nelly', 'Georgiana', 'Neta', 'Georgiann', 'Nettie', 'Geraldine', 'Neva', 'Gerri', 'Nichelle', 'Gerry', 'Nichole', 'Gertie', 'Niki', 'Ghislaine', 'Nikki', 'Gilda', 'Nila', 'Gina', 'Nilda', 'Ginny', 'Nina', 'Giovanna', 'Noreen', 'Giselle', 'Norma', 'Glenda', 'Ocie', 'Glinda', 'Octavia', 'Gloria', 'Oda', 'Glynis', 'Odell', 'Golda', 'Odessa', 'Grace', 'Ola', 'Gracie', 'Oleta', 'Graciela', 'Olga', 'Gregoria', 'Oliva', 'Greta', 'Olivia', 'Griselda', 'Ollie', 'Guadalupe', 'Oma', 'Gussie', 'Omega', 'Gwen', 'Ona', 'Gwendolyn', 'Ora', 'Hailey', 'Oralia', 'Haley', 'Otha', 'Hanna', 'Otilia', 'Harriett', 'Ouida', 'Harrison', 'Ozell', 'Hassie', 'Ozella', 'Hattie', 'Paige', 'Hayley', 'Pam', 'Hazel', 'Pamala', 'Heather', 'Pamela', 'Hedwig', 'Pandora', 'Hedy', 'Pansy', 'Hellen', 'Pat', 'Henrietta', 'Patricia', 'Herminia', 'Patsy', 'Hester', 'Patti', 'Hettie', 'Patty', 'Hilary', 'Paula', 'Hilda', 'Paulette', 'Hildegard', 'Pearl', 'Hollie', 'Pearlie', 'Holly', 'Peggy', 'Hope', 'Penelope', 'Ida', 'Penni', 'Ilene', 'Penny', 'Imelda', 'Petra', 'Imogene', 'Phillis', 'Inell', 'Phyllis', 'Ines', 'Polly', 'Iola', 'Precious', 'Iona', 'Princess', 'Ione', 'Priscilla', 'Ira', 'Queen', 'Iris', 'Rachael', 'Irma', 'Rae', 'Isabella', 'Raina', 'Isabelle', 'Ramonita', 'Iva', 'Ranae', 'Ivana', 'Raquel', 'Ivory', 'Reba', 'Jacelyn', 'Rena', 'Jacinta', 'Rene', 'Jackie', 'Renee', 'Jaclyn', 'Reva', 'Jacqueline', 'Rhea', 'Jacquelyn', 'Rhoda', 'Jada', 'Rikki', 'Jade', 'Riley', 'Jadwiga', 'Rita', 'Jama', 'Riva', 'James', 'Robbie', 'Jami', 'Roberta', 'Jamie', 'Robin', 'Jan', 'Robyn', 'Jana', 'Rochelle', 'Janay', 'Roma', 'Jane', 'Romaine', 'Janell', 'Romona', 'Janelle', 'Rona', 'Janet', 'Ronda', 'Janette', 'Roni', 'Janice', 'Ronna', 'Janie', 'Roosevelt', 'Janine', 'Rory', 'Janis', 'Rosa', 'Jann', 'Rosalie', 'Janna', 'Rosalind', 'Jannet', 'Rosalinda', 'Jannette', 'Rosanne', 'Jaqueline', 'Rosaria', 'Jaunita', 'Rosario', 'Jayme', 'Rosaura', 'Jayne', 'Rose', 'Jazmin', 'Roseann', 'Jazmine', 'Roseanne', 'Jean', 'Rosella', 'Jeana', 'Roselyn', 'Jeane', 'Rosemarie', 'Jeanette', 'Rosemary', 'Jeanie', 'Rosia', 'Jeanine', 'Rosie', 'Jeanna', 'Rosina', 'Jeanne', 'Roslyn', 'Jeannette', 'Rosy', 'Jeannie', 'Rowena', 'Jen', 'Roxana', 'Jena', 'Roxane', 'Jenee', 'Roxie', 'Jenifer', 'Roxanne', 'Jeniffer', 'Rubye', 'Jenilee', 'Ruth', 'Jenise', 'Rutha', 'Jenna', 'Ruthann', 'Jenni', 'Ruthanne', 'Jennie', 'Ruthe', 'Jennifer', 'Ruthie', 'Jenny', 'Sabina', 'Jeraldine', 'Sabrina', 'Jerilyn', 'Sadie', 'Jerlene', 'Sallie', 'Jerri', 'Salome', 'Jerrie', 'Samantha', 'Jestine', 'Sandra', 'Jettie', 'Sandy', 'Jewel', 'Sang', 'Jill', 'Sara', 'Jillian', 'Sarah', 'Jimmy', 'Sasha', 'Jocelyn', 'Saundra', 'Jodi', 'Scarlett', 'Jodie', 'Selena', 'Jolene', 'Selina', 'Jolie', 'Serena', 'Joni', 'Shana', 'Jonna', 'Shanda', 'Jordan', 'Shane', 'Josefa', 'Shanna', 'Josefina', 'Shannon', 'Josie', 'Shari', 'Joy', 'Sharron', 'Joyce', 'Shauna', 'Juana', 'Shawn', 'Juanita', 'Shawna', 'Judi', 'Sheena', 'Judith', 'Sheila', 'Judy', 'Shelby', 'Juliana', 'Shelia', 'Julie', 'Shelley', 'Juliet', 'Shelly', 'Juliette', 'Shena', 'June', 'Sheri', 'Junie', 'Sherri', 'Kacey', 'Sherrie', 'Kaitlin', 'Sherry', 'Kaitlyn', 'Sheryl', 'Kandi', 'Shiela', 'Kara', 'Shirley', 'Karan', 'Sierra', 'Kari', 'Silvia', 'Karin', 'Simone', 'Karina', 'Sindy', 'Karyn', 'Siobhan', 'Kasey', 'Socorro', 'Kassandra', 'Sofia', 'Katelyn', 'Sondra', 'Katelynn', 'Sonia', 'Kathaleen', 'Sonja', 'Katharina', 'Sonya', 'Katherine', 'Sophia', 'Katheryn', 'Stacey', 'Kathie', 'Staci', 'Kathleen', 'Stacia', 'Kathrine', 'Stacy', 'Kathryn', 'Star', 'Kathy', 'Starla', 'Katie', 'Stefanie', 'Katina', 'Stella', 'Katlyn', 'Stephanie', 'Kay', 'Stephenie', 'Kaye', 'Sue', 'Kayla', 'Summer', 'Kaylee', 'Sunny', 'Kelsey', 'Susan', 'Kelsi', 'Susana', 'Kendra', 'Susann', 'Kenya', 'Susanna', 'Keri', 'Susie', 'Kerri', 'Suzan', 'Kerrie', 'Suzann', 'Keshia', 'Suzanne', 'Kiana', 'Suzette', 'Kiersten', 'Sybil', 'Kim', 'Sylvia', 'Kimberley', 'Tabatha', 'Kimberly', 'Tabitha', 'Kira', 'Tai', 'Kirsten', 'Tami', 'Kirstin', 'Tamika', 'Kisha', 'Tammy', 'Kittie', 'Tana', 'Kori', 'Tanesha', 'Kourtney', 'Tania', 'Krista', 'Tanisha', 'Kristal', 'Tanya', 'Kristan', 'Tara', 'Kristen', 'Tarsha', 'Kristi', 'Taryn', 'Kristie', 'Tasha', 'Kristin', 'Tashina', 'Kristina', 'Tatiana', 'Kristine', 'Tawana', 'Krysta', 'Tawanda', 'Krystal', 'Tawanna', 'Krysten', 'Teena', 'Kyla', 'Tena', 'Kylee', 'Tenesha', 'Kylie', 'Terra', 'Lacey', 'Terresa', 'Laci', 'Tessa', 'Lacie', 'Thalia', 'Lacy', 'Thea', 'Ladonna', 'Theodora', 'Lakesha', 'Theresa', 'Lakisha', 'Therese', 'Lala', 'Tia', 'Lana', 'Tiana', 'Lane', 'Tierra', 'Lara', 'Tiffani', 'Lashanda', 'Tiffanie', 'Lashonda', 'Tiffany', 'Latanya', 'Tilda', 'Latasha', 'Tina', 'Latisha', 'Tisha', 'Latonia', 'Tobi', 'Latonya', 'Tonia', 'Latoya', 'Tonja', 'Laura', 'Tonya', 'Laureen', 'Tracee', 'Laurel', 'Tracey', 'Lauren', 'Tracie', 'Lauri', 'Tracy', 'Laurie', 'Trena', 'Lavada', 'Tresa', 'Lavonne', 'Tressa', 'Lawanda', 'Tricia', 'Lea', 'Trina', 'Leann', 'Trish', 'Leanna', 'Trisha', 'Leanne', 'Trudi', 'Leatha', 'Trudy', 'Lecia', 'Twila', 'Leigh', 'Twyla', 'Leila', 'Tyesha', 'Lela', 'Ula', 'Lelia', 'Una', 'Lenora', 'Ursula', 'Leola', 'Valencia', 'Leona', 'Valeria', 'Leone', 'Valerie', 'Leonie', 'Valorie', 'Leora', 'Vanessa', 'Lesa', 'Velma', 'Lesley', 'Vera', 'Leslie', 'Verda', 'Lessie', 'Verna', 'Leta', 'Veronica', 'Letha', 'Vicki', 'Leticia', 'Vickie', 'Letitia', 'Vicky', 'Lexie', 'Victoria', 'Lidia', 'Vilma', 'Lila', 'Viola', 'Lilian', 'Violet', 'Liliana', 'Virgie', 'Lilla', 'Virginia', 'Lillian', 'Vita', 'Lillie', 'Viva', 'Lily', 'Vonda', 'Lina', 'Wanda', 'Linda', 'Wendi', 'Lindsay', 'Wendy', 'Lindsey', 'Whitney', 'Lindy', 'Wilda', 'Lisa', 'Wilhelmina', 'Livia', 'Willa', 'Liz', 'Willie', 'Liza', 'Wilma', 'Lizbeth', 'Windy', 'Lizette', 'Winnie', 'Lois', 'Winter', 'Lola', 'Wren', 'Lolita', 'Wynona', 'Lorena', 'Xenia', 'Lorene', 'Yadira', 'Lorenza', 'Yasmin', 'Loretta', 'Yasmine', 'Lorine', 'Yesenia', 'Lorraine', 'Yolanda', 'Lorri', 'Yolonda', 'Lorrie', 'Yvette', 'Lottie', 'Yvonne', 'Lou', 'Zelda', 'Louann', 'Zella', 'Louella', 'Zelma', 'Louie', 'Zena', 'Louis', 'Zola', 'Louisa', 'Zora', 'Louise', 'Zula', 'Lourdes', 'Abby', 'Love', 'Abigail', 'Lovella', 'Adelaide', 'Lovie', 'Adeline', 'Lucie', 'Adrian', 'Lucienne', 'Adriana', 'Lucile', 'Adrienne', 'Lucinda', 'Aida', 'Luella', 'Aileen', 'Lula', 'Aimee', 'Lulu', 'Aisha', 'Luna', 'Alana', 'Luz', 'Alba', 'Lyda', 'Alejandra', 'Lyn', 'Alexa', 'Lynda', 'Alexandra', 'Lynette', 'Alexandria', 'Lynn', 'Alexis', 'Lynne', 'Alfreda', 'Lynnette', 'Alice', 'Mabel', 'Alicia', 'Mabelle', 'Aline', 'Macy', 'Alison', 'Madaline', 'Alissa', 'Madalyn', 'Allyson', 'Maddison', 'Alma', 'Mae', 'Alta', 'Maegan', 'Althea', 'Magdalena', 'Alyssa', 'Maggie', 'Amalia', 'Malinda', 'Amanda', 'Malissa', 'Amber', 'Mallory', 'Amelia', 'Mandy', 'Amie', 'Manuela', 'Ana', 'Mara', 'Anastasia', 'Marcela', 'Andrea', 'Marcella', 'Angel', 'Marcia', 'Angela', 'Margaret', 'Angelia', 'Margarita', 'Angeline', 'Margie', 'Angie', 'Margot', 'Anita', 'Margret', 'Ann', 'Marguerite', 'Anna', 'Mari', 'Anne', 'Maria', 'Annette', 'Mariana', 'Annie', 'Mariann', 'Antoinette', 'Marianne', 'Antonette', 'Maribel', 'April', 'Maribeth', 'Araceli', 'Mariel', 'Ashley', 'Mariela', 'Audra', 'Marietta', 'Audrey', 'Marilee', 'Augusta', 'Marilyn', 'Aurelia', 'Marina', 'Aurora', 'Marinda', 'Autumn', 'Marisa', 'Ava', 'Marisol', 'Avis', 'Marissa', 'Barbara', 'Marita', 'Beatrice', 'Maritza', 'Becky', 'Marlena', 'Belinda', 'Marley', 'Bernadette', 'Marlene', 'Bernice', 'Marquita', 'Bertha', 'Marry', 'Bessie', 'Marsha', 'Beth', 'Marta', 'Bethany', 'Martha', 'Bettie', 'Martina', 'Betty', 'Mary', 'Beulah', 'Maryann', 'Beverly', 'Maryanne', 'Bianca', 'Maryellen', 'Blanca', 'Maryjane', 'Bonita', 'Marylin', 'Bonnie', 'Marylou', 'Brandi', 'Mathilda', 'Brenda', 'Matilda', 'Briana', 'Mattie', 'Bridget', 'Maud', 'Bridgette', 'Maude', 'Brigitte', 'Maudie', 'Britney', 'Maura', 'Brittany', 'Maxine', 'Brooke', 'May', 'Brynn', 'Maybelle', 'Caitlin', 'Maye', 'Caitlyn', 'Mayme', 'Candace', 'Meg', 'Candice', 'Megan', 'Cara', 'Melba', 'Caren', 'Melinda', 'Carissa', 'Melissa', 'Carla', 'Melodee', 'Carly', 'Melodie', 'Carmela', 'Melody', 'Carmen', 'Mercedes', 'Carol', 'Merilyn', 'Carole', 'Merissa', 'Carolina', 'Meryl', 'Carolyn', 'Mia', 'Carrie', 'Micaela', 'Casandra', 'Michele', 'Casey', 'Michelle', 'Cassandra', 'Mickey', 'Cassie', 'Mikki', 'Catalina', 'Milagros', 'Catherine', 'Millicent', 'Cathleen', 'Mimi', 'Cathy', 'Minerva', 'Cecelia', 'Minta', 'Cecile', 'Mira', 'Cecilia', 'Miranda', 'Celeste', 'Miriam', 'Celestine', 'Misty', 'Celia', 'Mitzi', 'Chanel', 'Modesta', 'Charity', 'Moira', 'Charlene', 'Mollie', 'Charlotte', 'Molly', 'Charmaine', 'Monica', 'Chelsea', 'Monika', 'Cherie', 'Monique', 'Cheryl', 'Morgan', 'Chloe', 'Mozell', 'Christa', 'Mozella', 'Christi', 'Muriel', 'Christie', 'Myra', 'Christina', 'Myrna', 'Christine', 'Nadia', 'Christy', 'Nakia', 'Cindy', 'Nan', 'Claire', 'Nanci', 'Clarice', 'Nancie', 'Clarissa', 'Nanette', 'Claudia', 'Nannette', 'Claudine', 'Naomi', 'Cleo', 'Natasha', 'Colette', 'Nathalie', 'Connie', 'Nell', 'Constance', 'Nella', 'Cora', 'Nellie', 'Corina', 'Nelly', 'Corinne', 'Neta', 'Cornelia', 'Nettie', 'Courtney', 'Neva', 'Cristina', 'Nichelle', 'Crystal', 'Nichole', 'Cynthia', 'Niki', 'Daisy', 'Nikki', 'Dale', 'Nila', 'Dana', 'Nilda', 'Daniela', 'Nina', 'Daniella', 'Noreen', 'Danielle', 'Norma', 'Daphne', 'Ocie', 'Darlene', 'Octavia', 'Debbie', 'Oda', 'Debora', 'Odell', 'Deborah', 'Odessa', 'Debra', 'Ola', 'Dee', 'Oleta', 'Deena', 'Olga', 'Deidre', 'Oliva', 'Deirdre', 'Olivia', 'Delia', 'Ollie', 'Della', 'Oma', 'Delores', 'Omega', 'Denise', 'Ona', 'Desiree', 'Ora', 'Diamond', 'Oralia', 'Diana', 'Otha', 'Diane', 'Otilia', 'Dianna', 'Ouida', 'Dina', 'Ozell', 'Dixie', 'Ozella', 'Dollie', 'Paige', 'Dolly', 'Pam', 'Dolores', 'Pamala', 'Dominique', 'Pamela', 'Donna', 'Pandora', 'Dora', 'Pansy', 'Doreen', 'Pat', 'Dorothy', 'Patricia', 'Earlene', 'Patsy', 'Earline', 'Patti', 'Ebony', 'Patty', 'Eden', 'Paula', 'Edith', 'Paulette', 'Edna', 'Pearl', 'Edwina', 'Pearlie', 'Eileen', 'Peggy', 'Elaine', 'Penelope', 'Elena', 'Penni', 'Elinor', 'Penny', 'Elisa', 'Petra', 'Elisabeth', 'Phillis', 'Elise', 'Phyllis', 'Eliza', 'Polly', 'Elizabeth', 'Precious', 'Ella', 'Princess', 'Ellen', 'Priscilla', 'Elma', 'Queen', 'Elnora', 'Rachael', 'Eloise', 'Rae', 'Elsa', 'Raina', 'Elvira', 'Ramonita', 'Elsie', 'Ranae', 'Emilia', 'Raquel', 'Emily', 'Reba', 'Emma', 'Rena', 'Erica', 'Rene', 'Erika', 'Renee', 'Erma', 'Reva', 'Erna', 'Rhea', 'Ernestine', 'Rhoda', 'Esperanza', 'Rikki', 'Essie', 'Riley', 'Estella', 'Rita', 'Estelle', 'Riva', 'Ethel', 'Rochelle', 'Etta', 'Roma', 'Eugenia', 'Romaine', 'Eula', 'Romona', 'Eunice', 'Rona', 'Eva', 'Ronda', 'Evelyn', 'Roni', 'Faith', 'Ronna', 'Fannie', 'Rosa', 'Fay', 'Rosalie', 'Faye', 'Rosalind', 'Felicia', 'Rosalinda', 'Fern', 'Rosanne', 'Flora', 'Rosaria', 'Florence', 'Rosario', 'Fran', 'Rosaura', 'Frances', 'Rose', 'Freda', 'Roseann', 'Freida', 'Roseanne', 'Gabriela', 'Rosella', 'Gabrielle', 'Roselyn', 'Gail', 'Rosemarie', 'Gale', 'Rosemary', 'Gayle', 'Rosia', 'Gemma', 'Rosie', 'Gena', 'Rosina', 'Geneva', 'Roslyn', 'Genevieve', 'Rowena', 'Georgia', 'Roxana', 'Geraldine', 'Roxane', 'Gina', 'Roxie', 'Gladys', 'Roxanne', 'Glenda', 'Rubye', 'Glenna', 'Ruth', 'Gloria', 'Ruthann', 'Goldie', 'Ruthanne', 'Grace', 'Ruthe', 'Gracie', 'Ruthie', 'Graciela', 'Sabina', 'Greta', 'Sabrina', 'Gretchen', 'Sadie', 'Griselda', 'Sallie', 'Guadalupe', 'Salome', 'Gwen', 'Samantha', 'Gwendolyn', 'Sandra', 'Haley', 'Sandy', 'Hannah', 'Sang', 'Harriett', 'Sara', 'Hattie', 'Sarah', 'Hazel', 'Sasha', 'Heather', 'Saundra', 'Heidi', 'Scarlett', 'Helen', 'Selena', 'Helena', 'Selina', 'Helene', 'Serena', 'Henrietta', 'Shana', 'Hilda', 'Shanda', 'Hollie', 'Shane', 'Holly', 'Shanna', 'Hope', 'Shannon', 'Ida', 'Shari', 'Ilene', 'Sharron', 'Imogene', 'Shauna', 'Ines', 'Shawn', 'Inez', 'Shawna', 'Irene', 'Sheena', 'Iris', 'Sheila', 'Irma', 'Shelby', 'Isabel', 'Shelia', 'Isabella', 'Shelley', 'Ivory', 'Shelly', 'Jacqueline', 'Shena', 'Jade', 'Sheri', 'Jake', 'Sherri', 'Jami', 'Sherrie', 'Jan', 'Sherry', 'Jana', 'Sheryl', 'Jane', 'Shiela', 'Janet', 'Shirley', 'Janice', 'Sierra', 'Janie', 'Silvia', 'Janine', 'Simone', 'Janis', 'Sindy', 'Janna', 'Siobhan', 'Jannie', 'Socorro', 'Jasmine', 'Sofia', 'Jayne', 'Sondra', 'Jean', 'Sonia', 'Jeanette', 'Sonja', 'Jeanie', 'Sonya', 'Jeanne', 'Sophia', 'Jeannette', 'Stacey', 'Jenifer', 'Staci', 'Jennie', 'Stacia', 'Jennifer', 'Stacy', 'Jenny', 'Star', 'Jerri', 'Starla', 'Jill', 'Stella', 'Jillian', 'Stephanie', 'Jo', 'Stephenie', 'Joan', 'Sue', 'Jodi', 'Summer', 'Jodie', 'Sunny', 'Jolene', 'Susan', 'Josie', 'Susana', 'Joy', 'Susann', 'Joyce', 'Susanna', 'Juanita', 'Susie', 'Judith', 'Suzan', 'Judy', 'Suzann', 'Julia', 'Suzanne', 'Juliana', 'Suzette', 'Julie', 'Sybil', 'Juliet', 'Sylvia', 'June', 'Tabatha', 'Kaitlin', 'Tabitha', 'Kaitlyn', 'Tai', 'Kara', 'Tami', 'Karen', 'Tamika', 'Kari', 'Tammy', 'Karin', 'Tana', 'Karina', 'Tanesha', 'Karla', 'Tania', 'Karyn', 'Tanisha', 'Kasey', 'Tanya', 'Kassandra', 'Tara', 'Katelyn', 'Tarsha', 'Katelynn', 'Taryn', 'Katharine', 'Tasha', 'Katherine', 'Tashina', 'Kathleen', 'Tatiana', 'Kathrine', 'Tawana', 'Kathryn', 'Tawanda', 'Kathy', 'Tawanna', 'Katie', 'Teena', 'Katina', 'Tena', 'Katlyn', 'Tenesha', 'Kay', 'Terra', 'Kaye', 'Terresa', 'Kayla', 'Tessa', 'Kaylee', 'Thalia', 'Kelli', 'Thea', 'Kellie', 'Theodora', 'Kelly', 'Theresa', 'Kelsey', 'Therese', 'Kendra', 'Tia', 'Kenya', 'Tiana', 'Kerri', 'Tierra', 'Kerrie', 'Tiffani', 'Keshia', 'Tiffanie', 'Kiana', 'Tiffany', 'Kiersten', 'Tilda', 'Kim', 'Tina', 'Kimberley', 'Tisha', 'Kimberly', 'Tobi', 'Kira', 'Tonia', 'Kirsten', 'Tonya', 'Kirstin', 'Tracee', 'Kisha', 'Tracey', 'Kittie', 'Tracie', 'Kori', 'Tracy', 'Kourtney', 'Trena', 'Kris', 'Tresa', 'Krista', 'Tressa', 'Kristal', 'Tricia', 'Kristan', 'Trina', 'Kristen', 'Trish', 'Kristi', 'Trisha', 'Kristie', 'Trudi', 'Kristin', 'Trudy', 'Kristina', 'Twila', 'Kristine', 'Twyla', 'Krysta', 'Tyesha', 'Krystal', 'Ula', 'Kyla', 'Una', 'Kylee', 'Ursula', 'Kylie', 'Valencia', 'Lacey', 'Valeria', 'Laci', 'Valerie', 'Lacie', 'Valorie', 'Lacy', 'Vanessa', 'Ladonna', 'Velma', 'Lakesha', 'Vera', 'Lakisha', 'Verda', 'Lala', 'Verna', 'Lana', 'Veronica', 'Lara', 'Vicki', 'Latanya', 'Vickie', 'Latasha', 'Vicky', 'Latisha', 'Victoria', 'Latonia', 'Vilma', 'Latonya', 'Viola', 'Latoya', 'Violet', 'Laura', 'Virgie', 'Laurel', 'Virginia', 'Lauren', 'Vita', 'Lauri', 'Viva', 'Laurie', 'Vonda', 'Lavada', 'Wanda', 'Lavonne', 'Wendi', 'Lea', 'Wendy', 'Leann', 'Whitney', 'Leanna', 'Wilda', 'Leanne', 'Wilhelmina', 'Leigh', 'Willa', 'Leila', 'Willie', 'Lela', 'Wilma', 'Lelia', 'Windy', 'Lenora', 'Winnie', 'Leola', 'Winter', 'Leona', 'Wren', 'Leone', 'Wynona', 'Leonie', 'Xenia', 'Leora', 'Yadira', 'Lesa', 'Yasmin', 'Lesley', 'Yasmine', 'Leslie', 'Yesenia', 'Lessie', 'Yolanda', 'Leta', 'Yolonda', 'Letha', 'Yvette', 'Leticia', 'Yvonne', 'Letitia', 'Zelda', 'Lexie', 'Zella', 'Lidia', 'Zelma', 'Lila', 'Zena', 'Lilian', 'Zola', 'Liliana', 'Zora', 'Lilla', 'Zula'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez', 'Powell', 'Jenkins', 'Perry', 'Russell', 'Sullivan', 'Bell', 'Coleman', 'Butler', 'Henderson', 'Barnes', 'Gonzales', 'Fisher', 'Vasquez', 'Simmons', 'Romero', 'Jordan', 'Patterson', 'Alexander', 'Hamilton', 'Graham', 'Reynolds', 'Griffin', 'Wallace', 'West', 'Cole', 'Hayes', 'Chavez', 'Gibson', 'Bryant', 'Ellis', 'Stevens', 'Murray', 'Ford', 'Marshall', 'Harrison', 'McDonald', 'Woods', 'Kennedy', 'Wells', 'Stone', 'Webb', 'Palmer', 'Holmes', 'Fuller', 'Dixon', 'Hunt', 'Hudson', 'Fowler', 'Carroll', 'Duncan', 'Armstrong', 'Berry', 'Johnston', 'Lane', 'Hanson', 'Daniels', 'Meyer', 'Burns', 'Warren', 'Freeman', 'Larson', 'Wheeler', 'Larson', 'Carlson', 'Harper', 'George', 'Greene', 'Burke', 'Guzman', 'Morrison', 'Munoz', 'Jacobs', 'O\'Brien', 'Lawson', 'Franklin', 'Lynch', 'Bishop', 'Carr', 'Salazar', 'Austin', 'Mendez', 'Gilbert', 'Jensen', 'Williamson', 'Montgomery', 'Harvey', 'Oliver', 'Howell', 'Dean', 'Weaver', 'Hart', 'Hansen', 'Gardner', 'Simpson', 'Grant', 'Gordon', 'Rose', 'Frazier', 'Reynolds', 'Stone', 'Hawkins', 'Dunn', 'Perkins', 'Hudson', 'Spencer', 'Gardner', 'Stephens', 'Payne', 'Pierce', 'Berry', 'Bradley', 'Fox', 'Day', 'Rhodes', 'Bowman', 'Barton', 'Little', 'Stanley', 'Newman', 'Todd', 'Quinn', 'Curtis', 'Parks', 'Banks', 'Norris', 'Bass', 'Vaughn', 'Cross', 'Glover', 'Buchanan', 'Frank', 'Benson', 'Logan', 'Horton', 'Walsh', 'Baldwin', 'Maxwell', 'Lambert', 'Higgins', 'Barker', 'Sharp', 'Barber', 'Summers', 'Acosta', 'Bass', 'McGuire', 'Benson', 'Barton', 'Buchanan', 'Bush', 'Cannon', 'Cervantes', 'Cline', 'Cochran', 'Combs', 'Conner', 'Crane', 'Dawson', 'Dennis', 'Dodson', 'Doyle', 'Duke', 'Duran', 'English', 'Finley', 'Fitzgerald', 'Fleming', 'Fletcher', 'Floyd', 'Fry', 'Gallagher', 'Gates', 'Gillespie', 'Goodwin', 'Gross', 'Guerrero', 'Hale', 'Hammond', 'Hanna', 'Harmon', 'Hendricks', 'Hess', 'Higgins', 'Hoffman', 'Holland', 'Hull', 'Ingram', 'Keller', 'Kerr', 'Kirk', 'Klein', 'Kline', 'Knapp', 'Kramer', 'Lam', 'Lamb', 'Larsen', 'Leach', 'Levy', 'Lindsay', 'Livingston', 'Lloyd', 'Mack', 'Maldonado', 'Marks', 'Marsh', 'Matthews', 'Maxwell', 'May', 'McBride', 'McClain', 'McDaniel', 'McIntyre', 'McKee', 'McLaughlin', 'Melendez', 'Miles', 'Mills', 'Monroe', 'Mullen', 'Nash', 'Newton', 'Noble', 'Norman', 'Odom', 'Odonnell', 'Oneal', 'Oneill', 'Orr', 'Padilla', 'Page', 'Parrish', 'Pate', 'Patrick', 'Paul', 'Peck', 'Phelps', 'Pollard', 'Poole', 'Potter', 'Pratt', 'Preston', 'Prince', 'Proctor', 'Quintero', 'Randolph', 'Rasmussen', 'Reeves', 'Ritter', 'Rivers', 'Robbins', 'Rush', 'Santiago', 'Schmidt', 'Schneider', 'Schroeder', 'Shaffer', 'Shepherd', 'Short', 'Singleton', 'Snow', 'Snyder', 'Solis', 'Stark', 'Stout', 'Strong', 'Stuart', 'Sweeney', 'Sykes', 'Tate', 'Terrell', 'Thornton', 'Trevino', 'Trujillo', 'Tyler', 'Valdez', 'Valencia', 'Vance', 'Villarreal', 'Wade', 'Walton', 'Ware', 'Watts', 'Weiss', 'Wilkinson', 'Winters', 'Wong', 'Wyatt', 'Yoder', 'York', 'Zimmerman'];

// Build pool of unique "First Last" so we have enough variety (no consumer > 3 jobs)
const seen = new Set();
const CONSUMER_NAMES = [];
while (CONSUMER_NAMES.length < 3500) {
  const first = FIRST[Math.floor(Math.random() * FIRST.length)];
  const last = LAST[Math.floor(Math.random() * LAST.length)];
  const name = `${first} ${last}`;
  if (!seen.has(name)) {
    seen.add(name);
    CONSUMER_NAMES.push(name);
  }
}

function pickConsumer(consumerJobCount) {
  const available = CONSUMER_NAMES.filter((name) => (consumerJobCount[name] || 0) < 3);
  if (available.length === 0) return CONSUMER_NAMES[Math.floor(Math.random() * CONSUMER_NAMES.length)];
  return available[Math.floor(Math.random() * available.length)];
}

// Job categories: each has type name, 2-4 job_types (type, price, duration), and vendor definitions
const CATEGORIES = [
  {
    name: 'Plumbing',
    jobTypes: [
      { type: 'Plumbing Repair', price: 150, duration_minutes: 90 },
      { type: 'Water Heater Install', price: 1200, duration_minutes: 240 },
      { type: 'Drain Cleaning', price: 180, duration_minutes: 60 },
      { type: 'Pipe Leak Fix', price: 220, duration_minutes: 120 },
    ],
    vendors: ['QuickFix Plumbing', 'ProFlow Solutions', 'Bay Area Plumbing Co', 'Reliable Rooter', 'DripStop Plumbing', 'Metro Pipe Pros', 'GreenFlow Plumbing'],
  },
  {
    name: 'Landscaping',
    jobTypes: [
      { type: 'Lawn Mowing', price: 45, duration_minutes: 60 },
      { type: 'Garden Design', price: 800, duration_minutes: 480 },
      { type: 'Tree Trimming', price: 350, duration_minutes: 180 },
      { type: 'Mulching', price: 120, duration_minutes: 90 },
    ],
    vendors: ['GreenThumb Landscaping', 'Lawn & Order', 'Paradise Gardens', 'Sunrise Landscapes', 'EarthWorks Design', 'Turf Masters', 'Garden State Pro'],
  },
  {
    name: 'Roofing',
    jobTypes: [
      { type: 'Roof Inspection', price: 200, duration_minutes: 90 },
      { type: 'Shingle Replacement', price: 4500, duration_minutes: 480 },
      { type: 'Roof Repair', price: 550, duration_minutes: 180 },
      { type: 'Gutter Install', price: 900, duration_minutes: 240 },
    ],
    vendors: ['Peak Roofing Co', 'Summit Shingles', 'SafeHaven Roofing', 'TopNotch Roofers', 'Apex Roof Solutions', 'StormGuard Roofing'],
  },
  {
    name: 'Drywall',
    jobTypes: [
      { type: 'Drywall Install', price: 400, duration_minutes: 240 },
      { type: 'Drywall Repair', price: 180, duration_minutes: 120 },
      { type: 'Taping & Mudding', price: 350, duration_minutes: 300 },
      { type: 'Texture Match', price: 150, duration_minutes: 90 },
    ],
    vendors: ['SmoothWall Pros', 'Drywall Masters', 'WallCraft Inc', 'Patch & Finish Co', 'BoardRight Drywall', 'Seamless Walls LLC'],
  },
  {
    name: 'Electrician',
    jobTypes: [
      { type: 'Outlet Install', price: 120, duration_minutes: 60 },
      { type: 'Panel Upgrade', price: 2200, duration_minutes: 360 },
      { type: 'Wiring Repair', price: 280, duration_minutes: 120 },
      { type: 'Light Fixture Install', price: 95, duration_minutes: 45 },
    ],
    vendors: ['BrightSpark Electric', 'AmpPro Electrical', 'SafeWire Solutions', 'Current Masters', 'VoltRight Electric', 'CircuitFix Pro', 'PowerFlow Electric'],
  },
  {
    name: 'HVAC',
    jobTypes: [
      { type: 'AC Tune-Up', price: 120, duration_minutes: 90 },
      { type: 'Furnace Repair', price: 250, duration_minutes: 120 },
      { type: 'AC Install', price: 4500, duration_minutes: 480 },
      { type: 'Duct Cleaning', price: 350, duration_minutes: 180 },
    ],
    vendors: ['CoolBreeze HVAC', 'ComfortZone Heating & Cooling', 'FrostGuard AC', 'ClimatePro LLC', 'AirRight HVAC', 'TempMaster Services'],
  },
  {
    name: 'Painting',
    jobTypes: [
      { type: 'Interior Room Paint', price: 350, duration_minutes: 240 },
      { type: 'Exterior House Paint', price: 2500, duration_minutes: 960 },
      { type: 'Cabinet Refinish', price: 800, duration_minutes: 360 },
      { type: 'Touch-Up & Patch', price: 100, duration_minutes: 60 },
    ],
    vendors: ['FreshCoat Painters', 'ColorSplash Pro', 'BrushWorks Painting', 'Premier Paint Co', 'Palette Perfect', 'HousePaint Express', 'Canvas Painting LLC'],
  },
  {
    name: 'Carpentry',
    jobTypes: [
      { type: 'Custom Shelving', price: 450, duration_minutes: 240 },
      { type: 'Deck Build', price: 3500, duration_minutes: 960 },
      { type: 'Door Install', price: 250, duration_minutes: 120 },
      { type: 'Trim Work', price: 180, duration_minutes: 90 },
    ],
    vendors: ['Sawdust & Sons', 'Precision Woodworks', 'TimberCraft LLC', 'FrameRight Carpentry', 'WoodWorks Pro', 'Custom Cut Carpentry'],
  },
  {
    name: 'Masonry',
    jobTypes: [
      { type: 'Brick Repair', price: 400, duration_minutes: 180 },
      { type: 'Patio Install', price: 2800, duration_minutes: 720 },
      { type: 'Chimney Repair', price: 650, duration_minutes: 240 },
      { type: 'Concrete Pour', price: 800, duration_minutes: 360 },
    ],
    vendors: ['SolidStone Masonry', 'Brick & Mortar Co', 'StoneCraft Pros', 'Foundation First', 'MasonWorks LLC', 'Concrete Masters'],
  },
  {
    name: 'Flooring',
    jobTypes: [
      { type: 'Hardwood Install', price: 1200, duration_minutes: 480 },
      { type: 'Tile Install', price: 900, duration_minutes: 360 },
      { type: 'Carpet Install', price: 500, duration_minutes: 240 },
      { type: 'Floor Refinish', price: 600, duration_minutes: 300 },
    ],
    vendors: ['FloorPlan Pros', 'Underfoot Flooring', 'Tile & Wood Co', 'SmoothFloor LLC', 'Premier Floors', 'Refinish Masters', 'Hardwood Haven'],
  },
  {
    name: 'Photography',
    jobTypes: [
      { type: 'Portrait Session', price: 250, duration_minutes: 90 },
      { type: 'Event Photography', price: 800, duration_minutes: 360 },
      { type: 'Product Photography', price: 350, duration_minutes: 120 },
      { type: 'Real Estate Photos', price: 200, duration_minutes: 60 },
    ],
    vendors: ['Lens & Light Studio', 'Capture Co', 'Frame by Frame', 'ShutterBurst Photography', 'Moment Photography', 'PixelPerfect Pro', 'Candid Lens Co'],
  },
  {
    name: 'Videography',
    jobTypes: [
      { type: 'Short Form Video', price: 500, duration_minutes: 240 },
      { type: 'Wedding Video', price: 2200, duration_minutes: 720 },
      { type: 'Commercial Shoot', price: 1200, duration_minutes: 360 },
      { type: 'Drone Footage', price: 400, duration_minutes: 120 },
    ],
    vendors: ['ReelCraft Video', 'Motion Picture Co', 'ClipStudio Pro', 'FrameRate Films', 'VideoVerse LLC', 'ActionCut Productions'],
  },
  {
    name: 'Modeling',
    jobTypes: [
      { type: 'Portfolio Shoot', price: 300, duration_minutes: 120 },
      { type: 'Fashion Show', price: 800, duration_minutes: 240 },
      { type: 'Commercial Modeling', price: 600, duration_minutes: 180 },
      { type: 'Product Modeling', price: 400, duration_minutes: 120 },
    ],
    vendors: ['Face Forward Agency', 'Runway Ready Models', 'Portfolio Pro', 'StyleHouse Talent', 'Image Models Co', 'Spotlight Talent'],
  },
  {
    name: 'Art Commissions',
    jobTypes: [
      { type: 'Portrait Commission', price: 350, duration_minutes: 600 },
      { type: 'Mural', price: 1500, duration_minutes: 1440 },
      { type: 'Custom Illustration', price: 200, duration_minutes: 240 },
      { type: 'Digital Art', price: 150, duration_minutes: 180 },
    ],
    vendors: ['Canvas & Ink', 'Brushstroke Studio', 'Custom Art Co', 'Mural Masters', 'Sketch & Paint', 'Artisan Commissions', 'Painted Dreams'],
  },
  {
    name: 'Graphic Design',
    jobTypes: [
      { type: 'Logo Design', price: 400, duration_minutes: 480 },
      { type: 'Brand Kit', price: 800, duration_minutes: 720 },
      { type: 'Social Media Pack', price: 250, duration_minutes: 180 },
      { type: 'Flyer Design', price: 120, duration_minutes: 90 },
    ],
    vendors: ['Pixel Perfect Design', 'Type & Color Studio', 'BrandCraft Co', 'Visual Voice', 'DesignLab Pro', 'Creative Grid LLC', 'Ink & Vector'],
  },
  {
    name: 'Tutoring',
    jobTypes: [
      { type: 'Math Tutoring', price: 60, duration_minutes: 60 },
      { type: 'Test Prep', price: 90, duration_minutes: 90 },
      { type: 'Language Tutoring', price: 55, duration_minutes: 60 },
      { type: 'Music Lesson', price: 70, duration_minutes: 60 },
    ],
    vendors: ['BrightMind Tutoring', 'StudyBuddy Pro', 'LearnRight Academy', 'TutorTime LLC', 'Subject Masters', 'EduConnect Tutors', 'SkillBuild Learning'],
  },
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Global: track how many jobs each consumer has (max 3)
const consumerJobCount = {};

function addUpcomingJobsForVendor(cat, expYears) {
  // More experienced = busier: more days (0–3 weeks) and more jobs per day (2–5)
  const expNorm = Math.min(22, Math.max(0, expYears));
  const daysToSchedule = rndInt(expNorm < 6 ? 0 : 7, expNorm < 12 ? 14 : 21);
  const minJobsPerDay = expNorm < 8 ? 2 : 3;
  const maxJobsPerDay = expNorm < 14 ? 4 : 5;

  const upcoming = [];
  const baseDate = new Date(2026, 1, 15); // Feb 15, 2026

  for (let d = 0; d < daysToSchedule; d++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + d);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dateStr = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const jobsThisDay = rndInt(minJobsPerDay, maxJobsPerDay);
    // Place jobs with gaps: day window 7:00–19:00 (720 min), each job has duration + gap (45–90 min)
    const slots = [];
    let minute = 7 * 60; // 7:00
    for (let i = 0; i < jobsThisDay && minute < 18 * 60; i++) {
      const j = rnd(cat.jobTypes);
      const dur = j.duration_minutes;
      const endMinute = minute + dur;
      if (endMinute > 19 * 60) break;
      const startH = Math.floor(minute / 60);
      const startM = minute % 60;
      const endH = Math.floor(endMinute / 60);
      const endM = endMinute % 60;
      const consumer = pickConsumer(consumerJobCount);
      consumerJobCount[consumer] = (consumerJobCount[consumer] || 0) + 1;

      slots.push({
        date: dateStr,
        start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
        end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
        price: j.price,
        type: j.type,
        consumer_name: consumer,
      });
      minute = endMinute + rndInt(45, 90); // gap before next job
    }
    upcoming.push(...slots);
  }

  return upcoming;
}

let vendorId = 1;
const rows = [];
const header = 'vendor_id,name,weekly_availability,max_distance_miles,home_location,experience_years,negotiation_aggression,job_types,upcoming_jobs';

for (const cat of CATEGORIES) {
  const jobTypesJson = JSON.stringify(
    cat.jobTypes.map((j) => ({ type: j.type, price: j.price, duration_minutes: j.duration_minutes }))
  );

  for (const vendorName of cat.vendors) {
    const city = rnd(CITIES);
    const homeLocation = JSON.stringify({
      lat: Math.round(jitter(city.lat) * 10000) / 10000,
      lng: Math.round(jitter(city.lng) * 10000) / 10000,
    });
    const weekly = rnd(AVAILABILITIES);
    const maxDist = rndInt(15, 45);
    const expYears = rndInt(2, 22);
    const aggression = rndInt(1, 3);

    const upcoming = addUpcomingJobsForVendor(cat, expYears);
    const upcomingJson = JSON.stringify(upcoming);

    const row = [
      vendorId,
      vendorName,
      weekly,
      maxDist,
      homeLocation,
      expYears,
      aggression,
      jobTypesJson,
      upcomingJson,
    ].map(escapeCsv).join(',');

    rows.push(row);
    vendorId++;
  }
}

const csv = [header, ...rows].join('\n');
const outPath = 'vendor_data.csv';
fs.writeFileSync(outPath, csv, 'utf8');
console.log(`Wrote ${rows.length} vendors to ${outPath}`);
