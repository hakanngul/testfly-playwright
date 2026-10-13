Feature: TodoMVC

  @smoke
  Scenario: Add a todo
    Given I open the todo app
    When I add the todo "Write tests with TestFly"
    Then the todo list shows "Write tests with TestFly"
