-- Initial building layout: 4 apartments with 2 spaces each. Access codes are generated in the admin area.
do $$
declare
  apt uuid;
  n integer;
begin
  if exists (select 1 from apartments) or exists (select 1 from parking_spaces) then
    return;
  end if;
  for n in 1..4 loop
    insert into apartments (name) values (n::text) returning id into apt;
    insert into parking_spaces (space_number, apartment_id) values (n * 2 - 1, apt), (n * 2, apt);
  end loop;
end
$$;
