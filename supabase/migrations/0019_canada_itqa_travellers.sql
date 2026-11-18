-- =====================================================================
-- 0019: Canada ITQA delegation: the group list
--
-- Adds everyone on the Canada ITQA travel sheet (98 people) to the
-- "Canada ITQA - 90 Members" delegation (25 Nov to 2 Dec, from the Google
-- Calendar). They then appear on the delegation's Travellers tab, grouped by
-- arrival flight for pickups, and on its AeK and Region Guidance links.
--
-- How the sheet was tidied
--   * Times are UK 24-hour (9:45 am = 09:45, 12:50 pm = 12:50).
--   * Airports: "LGW - Terminal N", "Gatwick Terminal N", "LGW N" and plain
--     "LGW" for TS122 are all "Gatwick North". "LHR Terminal 2",
--     "LHR (Terminal 2)" etc. are "Heathrow T2".
--   * Where "LHR" had no terminal but others on the same flight gave one, that
--     terminal is used: AC858 = Heathrow T2, WS2 / WS0002 = Heathrow T4.
--     WS3471, UA16, UA924 and IB3589 had no terminal anywhere, so they're
--     just "Heathrow".
--   * WS0002 is written WS2, so it groups with the others on that flight.
--   * Where the notes contradict the Yes/No columns, the notes win:
--       1  Humaira Ahsan     no drop-off ("not drop off on return")
--       84 Mussawra Cheema   no pickup (flies to Manchester), drop-off 30 Nov
--       88 Sadia Hafeez Adam no pickup ("no PU" on the sheet)
--       89 Bisma Saeeda      drop-off on 1 Dec ("would need a ride for airport")
--   * "Needs a bed" is set for the four people whose notes ask for one
--     (22, 35, 40, 68).
--   * Things to check with the group are written in each person's notes.
--   * Nobody's return flight is on the sheet. The AeK can add them through
--     the AeK link, or the team can on the Travellers tab.
--
-- Row 50 isn't on the sheet, and row 81 wasn't visible in the copy received:
-- add them on the Travellers tab if they exist.
--
-- Run after 0018_delegation_travellers.sql. Safe to run again: people already
-- added (by their number on the sheet) are left as they are, so later edits
-- in the portal are kept.
-- =====================================================================

do $$
declare
  did uuid;
  n integer;
begin
  select count(*), min(id::text)::uuid into n, did
  from public.delegations
  where name ilike '%canada%itqa%';

  if n = 0 then
    raise exception 'No delegation called "Canada ITQA…" was found. Check it has come through from the Google Calendar (open the Delegations page once), then run this again.';
  elsif n > 1 then
    raise exception 'More than one delegation is called "Canada ITQA…". Rename the extra one, then run this again.';
  end if;

  -- 98 activity log lines would bury everything else.
  perform set_config('mka.skip_audit', 'on', true);

  insert into public.delegation_travellers (
    delegation_id, ref, full_name, phone, arrival_date, arrival_time, arrival_flight, arrival_place,
    needs_pickup, needs_dropoff, needs_bed, departure_date, notes
  )
  select did, v.ref, v.full_name, v.phone, v.arrival_date::date, v.arrival_time::time, v.flight, v.place,
         v.pickup, v.dropoff, v.bed, v.departure_date::date, v.notes
  from (values
    -- ref, name, phone, arrives, time, flight, airport, pickup, drop-off, bed, departs, notes
    (1,   'Humaira Ahsan',                          '647-870-6263',     '2026-11-28', '09:45', 'TS122',  'Gatwick North', true,  false, false, null, 'Needs pickup from the airport but not drop-off on return.'),
    (2,   'Abida Nasreen',                          '647-772-9461',     '2026-11-25', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (3,   'Buqa-tul-Noor Sheikh',                   '647-338-8597',     '2026-11-25', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, 'She might go to see her family over there, but she will stay with the group.'),
    (4,   'Hafiza Shajratul Islam',                 '647-221-2935',     '2026-11-25', '09:45', 'TS122',  'Gatwick North', true,  false, false, null, 'She is taking her 2-year-old daughter with her.'),
    (5,   'Nida Khalid (Shajra''s daughter)',       '647-221-2935',     '2026-11-25', '09:45', 'TS122',  'Gatwick North', true,  false, false, null, null),
    (6,   'Naila Andleeb',                          '647-786-1640',     '2026-11-25', '11:20', 'AC858',  'Heathrow T2',   true,  true,  false, null, null),
    (7,   'Mansoora Muneeb',                        '+64 22 359 2964',  '2026-11-25', '18:35', 'CZ303',  'Heathrow T4',   true,  false, false, null, null),
    (8,   'Sadia Muneeb',                           '+64 22 033 7058',  '2026-11-25', '18:35', 'CZ303',  'Heathrow T4',   true,  false, false, null, null),
    (9,   'Farida Munir',                           '+64 21 151 5203',  '2026-11-25', '18:35', 'CZ303',  'Heathrow T4',   true,  false, false, null, null),
    (10,  'Fakhra Waqar',                           '414-306-3745',     '2026-11-26', '06:55', 'BA294',  'Heathrow T2',   true,  true,  false, null, 'Check terminal: the sheet says Terminal 2 for a BA flight.'),
    (11,  'Nazia Tariq',                            '414-574-6169',     '2026-11-26', '06:55', 'BA294',  'Heathrow T2',   true,  true,  false, null, 'Check terminal: the sheet says Terminal 2 for a BA flight.'),
    (12,  'Muneefa Fahim Chaudhry',                 '587-700-3997',     '2026-11-26', '09:20', 'AC850',  'Heathrow T2',   true,  true,  false, null, null),
    (13,  'Bushra Sadaf Chaudhry',                  '587-890-2988',     '2026-11-26', '09:20', 'AC850',  'Heathrow T2',   true,  true,  false, null, null),
    (14,  'Azra Khokhar',                           '647-889-3747',     '2026-11-26', '08:30', 'AC856',  'Heathrow T2',   true,  true,  false, null, null),
    (15,  'Mansoora Naseem',                        '647-470-5079',     '2026-11-26', '08:30', 'AC856',  'Heathrow T2',   true,  true,  false, null, 'She is a guest.'),
    (16,  'Kousar Tanveer',                         '514-550-6835',     '2026-11-26', '07:10', null,     'Heathrow T2',   true,  false, false, null, 'Flying from Montreal (YUL). Flight number not given.'),
    (17,  'Kousar Parveen',                         '289-600-2574',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (18,  'Roohi Ahmed Cheema',                     '437-985-1318',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, 'With a 4-year-old girl.'),
    (19,  'Maria Sandhu',                           '289-339-1412',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (20,  'Wajeeha Iffat',                          '437-985-1318',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, 'Extra bed for a 4-year-old.'),
    (21,  'Atia-tul-Wakil Musa',                    '647-719-7055',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (22,  'Qanita Ahmad Fahiem',                    '647-858-1407',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  true,  null, 'If possible she needs a bed: it''s not easy for her to sleep at floor level.'),
    (23,  'Bushra Syeda Sahiba',                    '647-745-8155',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (24,  'Beenish Musa (Atia''s mom)',             '778-927-4255',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (25,  'Tahira Hussain',                         '647-679-3220',     '2026-11-26', '09:35', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (26,  'Anila Nawaz',                            '343-585-3519',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (27,  'Muneeb Ahmed (Anila''s son)',            '343-585-3519',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (28,  'Amtul Mateen',                           '416-520-3773',     '2026-11-26', '09:35', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (29,  'Shaista Rizwan',                         '437-484-1182',     '2026-11-26', '09:35', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (30,  'Umbreen Maalik',                         '647-772-2004',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (31,  'Asma Saleem',                            '647-701-8748',     '2026-11-26', '09:35', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (32,  'Shamas un Nisa Khan',                    '416-319-6891',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (33,  'Natasha Rahman',                         '519-981-1528',     '2026-11-26', '11:20', 'AC858',  'Heathrow T2',   true,  true,  false, null, null),
    (34,  'Afrah Qureshi',                          '647-949-4935',     '2026-11-26', '11:20', 'AC858',  'Heathrow T2',   true,  true,  false, null, null),
    (35,  'Shazia Khan',                            '703-401-4992',     '2026-11-26', '10:50', 'UA924',  'Heathrow',      true,  false, true,  null, 'Severe back pain, can''t sleep on the floor. Needs a bed.'),
    (36,  'Iram Shad Sahiba',                       '416-996-7001',     '2026-11-26', '11:20', 'AC858',  'Heathrow T2',   true,  true,  false, null, null),
    (37,  'Nudrat Mansoor',                         '587-501-2545',     '2026-11-26', '12:50', 'WS3313', 'Heathrow T4',   true,  true,  false, null, null),
    (38,  'Bushra Shafiq',                          '305-850-0042',     '2026-11-26', '12:50', 'WS3471', 'Heathrow',      true,  true,  false, null, null),
    (39,  'Farida Jabeen',                          '306-717-7079',     '2026-11-26', '12:50', 'WS3471', 'Heathrow',      true,  true,  false, null, null),
    (40,  'Sadaf Aleem Siddiqui',                   '306-202-8121',     '2026-11-26', '12:50', 'WS359',  'Heathrow T4',   true,  false, true,  null, 'Severe back pain, can''t sleep on the floor or a hard surface. Needs a bed.'),
    (41,  'Rashda Mirza',                           '780-938-2383',     '2026-11-26', '12:50', 'WS2',    'Heathrow T4',   true,  true,  false, null, null),
    (42,  'Amtul Qayyum Anjum',                     '403-903-3532',     '2026-11-26', '12:50', 'WS2',    'Heathrow T4',   true,  true,  false, null, null),
    (43,  'Farwa Wajahat',                          '44-730-006-0054',  '2026-11-26', '12:50', 'WS3471', 'Heathrow',      true,  false, false, null, null),
    (44,  'Areebah Ahmed',                          '306-351-5291',     '2026-11-26', '12:50', 'WS2',    'Heathrow T4',   true,  true,  false, null, 'Drop-off marked "Yes/Late" on the sheet: check the time.'),
    (45,  'Abeeha Maryam Ahmed',                    '306-351-5291',     '2026-11-26', '12:50', 'WS2',    'Heathrow T4',   true,  true,  false, null, null),
    (46,  'Amtul Qayuum Tahir',                     '306-241-2374',     '2026-11-26', '12:50', 'WS',     'Heathrow T4',   true,  true,  false, null, 'Flight number given only as "WS" (WestJet). Probably WS2 with the others at 12:50: check.'),
    (47,  'Hafiza Faiqa',                           '587-830-1317',     '2026-11-26', '12:50', 'WS2',    'Heathrow T4',   true,  true,  false, null, null),
    (48,  'Rubila Munawwar',                        '403-797-2365',     '2026-11-26', '12:50', 'WS2',    'Heathrow T4',   true,  true,  false, null, 'Sheet says her flight information is missing: confirm WS2.'),
    (49,  'Shumaila Sabah',                         '306-581-7706',     '2026-11-26', '12:50', 'WS2',    'Heathrow T4',   true,  true,  false, null, null),
    (51,  'Khola Hasina Chaudhry',                  '647-470-6362',     '2026-11-27', '08:30', 'AC856',  'Heathrow T2',   true,  true,  false, null, null),
    (52,  'Asma Choudary',                          '647-523-5145',     '2026-11-27', '08:30', 'AC856',  'Heathrow T2',   true,  true,  false, null, null),
    (53,  'Sadia Sheraz',                           '443-768-2918',     '2026-11-27', '06:15', 'IB3589', 'Heathrow',      true,  true,  false, null, null),
    (54,  'Nadia Abdul Rub',                        '848-200-9191',     '2026-11-27', '06:20', 'UA16',   'Heathrow',      true,  true,  false, null, null),
    (55,  'Sadia Fateh Uddin',                      '443-564-6514',     '2026-11-27', '06:20', 'UA16',   'Heathrow',      true,  true,  false, null, null),
    (56,  'Ayesha Syed',                            '647-824-6822',     '2026-11-27', '06:30', 'AC854',  'Heathrow T2',   true,  false, false, null, null),
    (57,  'Sumra Mushtaq (Ayesha Syed''s daughter)', '437-262-7214',    '2026-11-27', '06:30', 'AC854',  'Heathrow T2',   true,  false, false, null, null),
    (58,  'Lubna Mushtaq (Ayesha Syed''s daughter)', '437-262-5149',    '2026-11-27', '06:30', 'AC854',  'Heathrow T2',   true,  false, false, null, null),
    (59,  'Sarwat Perveen',                         '647-971-4529',     '2026-11-27', '06:30', null,     'Heathrow T2',   true,  true,  false, null, 'Flight number not given (lands 06:30 at T2, same as AC854).'),
    (60,  'Noor ul Huda',                           '647-971-4529',     '2026-11-27', '06:30', null,     'Heathrow T2',   true,  true,  false, null, 'Flight number not given (lands 06:30 at T2, same as AC854).'),
    (61,  'Amatul Qayoom Cheema',                   '647-453-4094',     '2026-11-27', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (62,  'Shamasul-nihar Cheema',                  '647-321-4094',     '2026-11-27', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (63,  'Amatul Hayee',                           '647-333-4094',     '2026-11-27', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (64,  'Nuzhat Islam',                           '905-965-2539',     '2026-11-27', '09:45', 'TS122',  'Gatwick North', true,  false, false, null, null),
    (65,  'Mubarika Mateen Khan',                   '647-234-2590',     '2026-11-27', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (66,  'Maria Irfan',                            '647-550-8210',     '2026-11-27', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (67,  'Naseera Kouser',                         '647-701-9974',     '2026-11-27', '09:45', 'TS122',  'Gatwick North', true,  false, false, null, null),
    (68,  'Mutahira Farooqi',                       '416-388-9693',     '2026-11-27', '09:45', 'TS122',  'Gatwick North', true,  true,  true,  null, 'Needs a chair for offering Salat, and a bed a bit higher from the floor so she can get up easily.'),
    (69,  'Tanzila Ahmed',                          '437-876-6798',     '2026-11-27', '09:45', 'TS122',  'Gatwick North', true,  true,  false, null, null),
    (70,  'Amatul Ghafoor Khan',                    '416-278-2727',     '2026-11-27', '11:20', 'AC',     'Heathrow T2',   true,  true,  false, null, 'Flight number given only as "AC" (Air Canada): check.'),
    (71,  'Urwa Zafar (Amtul''s daughter)',         '416-278-2727',     '2026-11-27', '11:20', 'AC',     'Heathrow T2',   true,  true,  false, null, 'Flight number given only as "AC" (Air Canada): check.'),
    (72,  'Nasira Umar',                            '431-336-3276',     '2026-11-27', '12:50', 'WS2',    'Heathrow T4',   true,  true,  false, null, null),
    (73,  'Sumbul Iqbal',                           '431-588-5577',     '2026-11-27', '12:50', 'WS2',    'Heathrow T4',   true,  true,  false, null, null),
    (74,  'Farhana Asif',                           '604-442-7499',     '2026-11-26', '14:20', 'BA084',  'Heathrow T3',   true,  true,  false, null, 'Check terminal: the sheet says Terminal 3.'),
    (75,  'Khola Nusrat',                           '973-818-0226',     '2026-11-26', '10:10', 'BA292',  'Heathrow T5',   true,  true,  false, null, null),
    (76,  'Jamaal Majeed (Khola''s son)',           '973-818-0226',     '2026-11-26', '10:10', 'BA292',  'Heathrow T5',   true,  true,  false, null, null),
    (77,  'Qudsia Masood',                          '905-699-9619',     null,         null,    'BA0092', null,            false, false, false, null, 'Doesn''t need a ride either way, just accommodation (26 to 30 Nov).'),
    (78,  'Naghmana Mansoor',                       '647-967-7860',     '2026-11-22', '09:45', 'TS122',  'Gatwick North', false, false, false, null, null),
    (79,  'Fazeelat Akhtar',                        '647-501-4796',     '2026-11-25', '11:20', 'AC858',  'Heathrow T2',   false, false, false, null, null),
    (80,  'Ishmal Urooj',                           '647-862-1687',     '2026-11-21', '09:45', 'TS122',  'Gatwick North', false, false, false, null, null),
    (82,  'Amatur Rafeeq Bushra',                   '519-819-0609',     '2026-11-23', '10:50', 'FI450',  'Heathrow T2',   false, false, false, null, 'Her husband is travelling with her. She is asking for a pickup for her husband: check what''s needed.'),
    (84,  'Mussawra Cheema',                        '443-531-9713',     '2026-11-26', null,    null,     'Manchester',    false, true,  false, '2026-11-30', 'Flying from the US to Manchester; joins the group on 26 Nov. No pickup needed. Needs accommodation, and a ride back to the airport on 30 Nov.'),
    (86,  'Naima Fazzelat (Ishmal''s mom)',         '647-862-1687',     '2026-11-21', '09:45', 'TS122',  'Gatwick North', false, false, false, null, null),
    (88,  'Sadia Hafeez Adam',                      '437-855-0043',     '2026-11-26', '09:45', 'TS122',  'Gatwick North', false, false, false, null, 'Sheet says no pickup ("no PU"). The family has a Mulaqat with Huzoor (aba) on Sunday 29 Nov and has asked permission to stay in Islamabad. If only 3 days in Islamabad are allowed, they will need accommodation at Baitul Futuh for the rest of the trip.'),
    (89,  'Bisma Saeeda',                           '437-365-4536',     '2026-11-18', '09:45', 'TS122',  'Gatwick North', false, true,  false, '2026-12-01', 'Doesn''t need pickup from the airport. Joins the group on 26 Nov and stays until her return on 1 Dec, when she needs a ride to the airport.'),
    (92,  'Fehmeda Kousar',                         '519-894-9591',     '2026-11-08', '05:45', 'AC844',  null,            false, true,  false, null, null),
    (103, 'Ghazala Rizwan',                         '647-701-8748',     '2026-11-27', '06:30', 'AC854',  'Heathrow T2',   true,  true,  false, null, null),
    (104, 'Faryaal Rizwan',                         '647-701-8748',     '2026-11-27', '06:30', 'AC854',  'Heathrow T2',   true,  true,  false, null, null),
    (105, 'Fouzia Mansoor',                         '289-200-8159',     '2026-11-26', '06:30', 'AC854',  'Heathrow T2',   true,  false, false, null, 'Sheet says 26 Nov; everyone else on AC854 arrives 27 Nov: check the date.'),
    (109, 'Atiqa Sadaf',                            '519-521-9307',     '2026-11-22', '08:30', 'LH6585', null,            false, false, false, null, null),
    (110, 'Ayesha Mubasher',                        '905-962-3648',     '2026-11-27', '06:30', 'AC854',  'Heathrow T2',   true,  true,  false, null, null),
    (111, 'Atiya Khawar',                           '204--698',         '2026-11-26', '12:50', 'WJ247',  'Heathrow T2',   true,  true,  false, null, 'Phone number is incomplete on the sheet. Flight "WJ247": check.'),
    (115, 'Nighat Rabbani',                         '905-230-8482',     '2026-11-26', '11:20', 'AC858',  'Heathrow T2',   true,  true,  false, null, null),
    (116, 'Urwa Rabbani',                           '905-230-8482',     '2026-11-26', '11:20', 'AC858',  'Heathrow T2',   true,  true,  false, null, null),
    (117, 'Aafia Rabbani',                          '905-230-8482',     '2026-11-26', '11:20', 'AC858',  'Heathrow T2',   true,  true,  false, null, null),
    (118, 'Naila Kanwal',                           '306-351-5291',     null,         null,    null,     null,            false, false, false, null, 'No travel details on the sheet.'),
    (119, 'Hala Rasheed',                           '306-351-5291',     null,         null,    null,     null,            false, false, false, null, 'No travel details on the sheet.'),
    (120, 'Rouba Alzaid',                           '613-262-2476',     '2026-11-26', '09:45', 'TS123',  'Heathrow T3',   true,  true,  false, null, 'Sheet says "TS123" and "LHR Terminal 3 N". TS122 lands at Gatwick North at 09:45: check which it is.'),
    (121, 'Saadia Amtul Basit',                     '647-284-0887',     '2026-11-26', '08:30', 'AC856',  'Heathrow T2',   true,  false, false, null, null)
  ) as v(ref, full_name, phone, arrival_date, arrival_time, flight, place, pickup, dropoff, bed, departure_date, notes)
  on conflict (delegation_id, ref) do nothing;

  get diagnostics n = row_count;
  perform set_config('mka.skip_audit', 'off', true);

  raise notice 'Canada ITQA: % people added (% on the list in total).', n,
    (select count(*) from public.delegation_travellers where delegation_id = did);
end $$;

-- Check: the arrival runs.
select t.arrival_date, to_char(min(t.arrival_time), 'HH24:MI') as lands, t.arrival_flight, t.arrival_place,
       count(*) as people, count(*) filter (where t.needs_pickup) as pickups
from public.delegation_travellers t
join public.delegations d on d.id = t.delegation_id
where d.name ilike '%canada%itqa%'
group by t.arrival_date, t.arrival_flight, t.arrival_place
order by t.arrival_date nulls last, min(t.arrival_time);
