---
title: Alamofire + AlamofireObjectMapper
date:  2018-12-27 10:00:00 +0100
tags:  ios alamofire realm swift

api: http://danielsaidi.com/demo_Alamofire_AlamofireObjectMapper_Realm/api
cocoapods: http://cocoapods.org/
dip: http://github.com/AliSoftware/Dip
github: http://github.com/danielsaidi/demo_Alamofire_AlamofireObjectMapper_Realm
video: http://www.youtube.com/watch?v=LuKehlKoN7o&lc=z22qu35a4xawiriehacdp435fnpjgmq2f54mjmyhi2tw03c010c.1502618893412377
twitter: http://twitter.com/danielsaidi

original: http://danielsaidi.com/blog/2017/08/23/alamofire-realm
---

This is an updated version of a talk I gave at CocoaHeads Sthlm in 2017 on how to use Alamofire to communcate with an api, AlamofireObjectMapper to map responses, the Alamofire `RequestRetrier` to automatically retry failing requests and the `RequestAdapter` to adapt all requests. I also demonstrated how to use Realm to seamlessly add offline support, using the decorator pattern.

In this post, I'll recreate the entire app from scratch, with some modifications. I have updated the [original post]({{page.original}}) to Swift 4.2. It uses some new code conventions as well, which I will cover in this post.


## Disclaimer 

Since I gave this talk, `Codable` has been released as a native part of Swift. I
will update this blog post to Swift 4.2, but you should really be using `Codable`
instead of `Mappable`, since it's now SO easy to combine Alamofire and `Codable`.

Regarding the demo app structure, I normally prefer to extract as much logic and
code as possible to separate libraries, which I then can use as decoupled blocks.
For instance, I would keep my domain logic in a domain library that doesn't know
anything about the app. I'd also keep all api logic in an api library that knows
about the domain, but not about the app. In this project, though, I will keep it
simple. Think of the `Api` folder as a separate library, and `Auth` and `Movies`
as part of a `Domain` library.


## Update information

The [original blog post]({{page.original}}) was released in August 2017, and was
updated about a week ago. The biggest differences between that post and this, is
that this post changes the following:

* I use `struct` instead of `class` for the models. Using structs simplifies how
you can use and extend your model, model collections etc. so using structs where
applicable is something that I really recommend.
* I no longer use model protocols. I instead use api-specific model structs that
can be converted to domain-specific models. This removes much fiddling needed to
make the api mapping work while still conforming to a model protocol.
* The Swift 4.2 demo app has much more comments, to guide developers and explain
what the various parts do. The code is also a lot better ;)


## Video

You can watch the original talk [here]({{page.video}}). The talk focuses more on
concepts than code, so that talk and this post complete eachother pretty well.


## Prerequisites

For this tutorial, I expect that you know how [CocoaPods]({{page.cocoapods}}) do
work. I will use terms like `podfile`, expecting you to know what it means.


## Source Code

I recommend that you create an empty app project then work through this tutorial
by coding. However, you can also download the source code for the Swift 4.2 demo
app from [GitHub]({{page.github}}). The `master` branch contains source code for
the demo app and `gh-pages` contains source code for the static api.


## Why use a static api?

In the demo, we will use a static api to fetch movies in different ways. The api
is a static Jekyll web site with a small movie collection, that lets us grab top
rated and top grossing movies, as well as single movies by id.

If you want to have a look at the static api data model, you can use these links:

* [Get a fake auth token]({{page.api}}/auth)
* [Get a single movie by id]({{page.api}}/movies/1)
* [Get top grossing movies 2016]({{page.api}}/movies/topGrossing/2016)
* [Get top grossing movies 2016 - sorted on rating]({{page.api}}/movies/topRated/2016)

The limited api hopefully lets us focus on Alamofire and Realm instead of having
to understand an external api, set up a developer account, handle auth logic etc.


## Step 1 - Define the domain model

Start by creating a clean Xcode project. I went with a simple iOS storyboard app,
but you can set it up in any way you like.

The app will fetch movie data from the api. A `Movie` has basic info and a `cast`
array of `MovieActor` instances. For simplicity, the `MovieActor` model only has
a name and is used to show how easy recursive mapping is with Alamofire.
 
Let's define this domain-specific model as two structs. Create a `Movies` folder
in the project root and add these two structs to it:

```swift
struct Movie {
    
    let id: Int
    let name: String
    let year: Int
    let releaseDate: Date
    let grossing: Int
    let rating: Double
    
    let cast: [MovieActor]
}
```

```swift
struct MovieActor {
    
    let name: String
}
```

As you'll see later, we will convert the api-specific models we receive from the
api to these structs. The app should only know about these structs, and not know
anything about the existence of an external api.


## Step 2 - Define the domain logic

Now let's define how the app should fetch movies. Add this protocol to `Movies`:

```swift
typealias MovieResult = (_ movie: Movie?, _ error: Error?) -> ()
typealias MoviesResult = (_ movies: [Movie], _ error: Error?) -> ()

protocol MovieService: class {
    
    func getMovie(id: Int, completion: @escaping MovieResult)
    func getTopGrossingMovies(year: Int, completion: @escaping MoviesResult)
    func getTopRatedMovies(year: Int, completion: @escaping MoviesResult)
}
```

Basically, the movie service lets us fetch movies asynchronously (well, it could
be implemented as a synchronous operation, but the completion block implies that
it will be asynchronous). It lets us fetch single movies as well as top grossing
and top rated movies for a specific year.


## Step 3 - Add Alamofire and AlamofireObjectMapper

Before we can add api-specific implementations to the app, we must use CocoaPods
to specify that the app needs `Alamofire` and `AlamofireObjectMapper`.

Run `pod init` in the app root folder to make CocoaPods create a `podfile`. Then
add add `Alamofire` and `AlamofireObjectMapper` to the file and run `pod install`
to download these libraries. Once this is done, open the generated workspace.

You can use `Carthage` to manage dependencies as well, but this demo app doesn't
cover that specific setup.


## Step 4 - Create an api specific domain model

With these dependencies in place, we can now add app-specific implememtations to
the app. Create an `Api` folder in the project root, add a `Mocies` folder to it
and add these two structs to it:

```swift
import ObjectMapper

class ApiMovie {
    
    required public init?(map: Map) {}
    
    var id = 0
    var name = ""
    var year = 0
    var releaseDate = Date(timeIntervalSince1970: 0)
    var grossing = 0
    var rating = 0.0
    var cast = [ApiMovieActor]()
    
    func convert() -> Movie {
        return Movie(
            id: id,
            name: name,
            year: year,
            releaseDate: releaseDate,
            grossing: grossing,
            rating: rating,
            cast: cast.map { $0.convert() }
        )
    }
}


// MARK: - Mappable

extension ApiMovie: Mappable {
    
    func mapping(map: Map) {
        id <- map["id"]
        name <- map["name"]
        year <- map["year"]
        releaseDate <- map["releaseDate"]
        grossing <- map["grossing"]
        rating <- map["rating"]
        cast <- map["cast"]
    }
}
``` 

```swift
import ObjectMapper

class ApiMovieActor {
    
    required public init?(map: Map) {}
    
    var name = ""
    
    func convert() -> MovieActor {
        return MovieActor(name: name)
    }
}


// MARK: - Mappable

extension ApiMovieActor: Mappable {
    
    func mapping(map: Map) {
        name <- map["name"]
    }
}
``` 

As you can see above, the api-specific structs provide mapping locic that can be
used by Alamofire to automatically map api responses to these structs. They also
have a `convert()` function to convert them to the domain-specific structs.

Besides this, `ApiMovie` uses a `DateTransform`, which we will discuss later. It
also has an `ApiMovieActor` array that is easily converted using `map/convert()`.

If we have set things up properly, we should now be able to point Alamofire to a
valid url and recursively parse movie data with little effort.


## Step 5 - Setup the core api logic

Before we create an api specific `MovieService` implementation, let's setup some
core api logic in the `Api` folder.


### Managing api environments

Since we developers often have to switch between different api environments (e.g.
test and production) I often use enums to provide available environments. I know
we only have a single environment now, but let's create it anyway. Add this enum
to the `Api` folder:

```swift
import Foundation

enum ApiEnvironment: String { case
    
    production = "http://danielsaidi.com/demo_Alamofire_AlamofireObjectMapper_Realm/api/"
    
    var url: String {
        return rawValue
    }
}
```


### Managing api routes

With the environment enum in place, we can list available routes in another enum.
Add this enum to the `Api` folder:

```swift
import Foundation

enum ApiRoute { case
    
    auth,
    movie(id: Int),
    topGrossingMovies(year: Int),
    topRatedMovies(year: Int)
    
    var path: String {
        switch self {
        case .auth: return "auth"
        case .movie(let id): return "movies/\(id)"
        case .topGrossingMovies(let year): return "movies/topGrossing/\(year)"
        case .topRatedMovies(let year): return "movies/topRated/\(year)"
        }
    }
    
    func url(for environment: ApiEnvironment) -> String {
        return "\(environment.url)/\(path)"
    }
}
```

Since `year` and `id` are dynamic route segments, we use associated values. This
is a really nice Swift enum feature. The enum can also provide a complete url if
it is given an api environment.


### Managing api context

I usually have an `ApiContext` class that manages api specific information, such
as the current environment and tokens. This context can be used by services that
need to communicate with the api. Using a singleton context ensures that all api
specific services are properly affected whenever the context changes.

Let's create an `ApiContext` protocol and as a non-persisted implementation. Add
a `Context` folder to the `Api` folder, then add these files to it:

```swift
protocol ApiContext {
    
    var environment: ApiEnvironment { get set }
}
```   

```swift
class NonPersistentApiContext: ApiContext {
    
    init(environment: ApiEnvironment) {
        self.environment = environment
    }
    
    var environment: ApiEnvironment
}
```

We can now inject this context into all out api specific service implementations.
If we later would like to create a persistent context, e.g. one that saves token
data in `UserDefault`, we just have to create another implementation and replace
the implementation we use in our app.


### Specifying basic api behavior

To simplify how the app communicates with the api, let's create a base class for
api-based services. Add an `Alamofire` folder to the `Api` folder, then add this
file to it:

```swift
import Alamofire

class AlamofireService {
    
    init(context: ApiContext) {
        self.context = context
    }
    
    
    var context: ApiContext
    
    
    func get(at route: ApiRoute) -> DataRequest {
        return request(at: route, method: .get, encoding: URLEncoding.default)
    }
    
    func post(at route: ApiRoute) -> DataRequest {
        return request(at: route, method: .post, encoding: JSONEncoding.default)
    }
    
    func put(at route: ApiRoute) -> DataRequest {
        return request(at: route, method: .put, encoding: JSONEncoding.default)
    }
    
    func request(at route: ApiRoute, method: HTTPMethod, params: Parameters = [:], encoding: ParameterEncoding) -> DataRequest {
        let url = route.url(for: context.environment)
        return Alamofire
            .request(url, method: method, parameters: params, encoding: encoding)
            .validate()
    }
}
``` 

Forcing our services to only use `ApiRoute` ensures that the app cannot make any
unspecified requests. If the app would have to call any custom URLs later on, we
could just add a `.custom(url: String)` case to the `ApiRoute` enum.

This was a pretty long setup, but we are now ready to fetch movies from the api!


## Step 6 - Create an api-based movie service

Let's create an api-based movie service that loads movies from the api! Just add
this file to the `Api/Movies` folder:

```swift
import Alamofire
import AlamofireObjectMapper

class AlamofireMovieService: AlamofireService, MovieService {
    
    func getMovie(id: Int, completion: @escaping MovieResult) {
        get(at: .movie(id: id)).responseObject { (response: DataResponse<ApiMovie>) in
            let result = response.result.value?.convert()
            completion(result, response.result.error)
        }
    }
    
    func getTopGrossingMovies(year: Int, completion: @escaping MoviesResult) {
        get(at: .topGrossingMovies(year: year)).responseArray { (response: DataResponse<[ApiMovie]>) in
            let result = response.result.value?.map { $0.convert() }
            completion(result ?? [], response.result.error)
        }
    }
    
    func getTopRatedMovies(year: Int, completion: @escaping MoviesResult) {
        get(at: .topRatedMovies(year: year)).responseArray { (response: DataResponse<[ApiMovie]>) in
            let result = response.result.value?.map { $0.convert() }
            completion(result ?? [], response.result.error)
        }
    }
}
```

As you can see, the code is super-simple. The service just performs get requests
for certain routes and specify api-specific return types, that are automatically
mapped by Alamofire and AlamofireObjectMapper. It then uses `convert()` to build
the domain-specific structs that are required by the protocol.

`getMovie` uses `responseObject`, while the other functions use `responseArray`.
This is because `getMovie` returns an optional object, while the other functions
return an array of objects. If the arrays were instead part of a response object
(much recommended), you would have to create api-specific models for these types
as well. Using response objects instead of arrays gives you more flexibility, so
I'd suggest that you avoid using arrays in your api.


## Step 7 - Fetch movies

We will now setup our app to fetch data from the api. Remove all the boilerplate
code from `ViewController` and add this code:

```swift
override func viewDidLoad() {
    super.viewDidLoad()
    let env = ApiEnvironment.production
    let context = NonPersistentApiContext(environment: env)
    let service = AlamofireMovieService(context: context)
    service.getTopGrossingMovies(year: 2016) { (movies, error) in
        if let error = error { return print(error.localizedDescription) }
        print("Found \(movies.count) movies:")
        movies.forEach { print("   \($0.name)") }
    }
}
```

**IMPORTANT** Before you can do this, you must allow the app to perform external
requests. Just add this to `Info.plist` (in a real world app, you should specify
an exact list of trusted domains):

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

Now run the app. If everything is correctly setup, it should print the following:

```
Found 10 movies:
   Finding Dory
   Rouge One - A Star Wars Story
   Captain America - Civil War
   The Secret Life of Pets
   The Jungle Book
   Deadpool
   Zootopia
   Batman v Superman - Dawn of Justice
   Suicide Squad
   Doctor Strange
```

If you see this in Xcode's log, the app loads movie data from the api. Well done!

Now change the print format for each movie to look like this:

```swift
movies.forEach { print("   \($0.name) (\($0.releaseDate))") }
```

The app should now output the following instead:

```
Found 10 movies:
   Finding Dory (1970-01-01 00:33:36 +0000)
   Rouge One - A Star Wars Story (1970-01-01 00:33:36 +0000)
   Captain America - Civil War (1970-01-01 00:33:36 +0000)
   The Secret Life of Pets (1970-01-01 00:33:36 +0000)
   The Jungle Book (1970-01-01 00:33:36 +0000)
   Deadpool (1970-01-01 00:33:36 +0000)
   Zootopia (1970-01-01 00:33:36 +0000)
   Batman v Superman - Dawn of Justice (1970-01-01 00:33:36 +0000)
   Suicide Squad (1970-01-01 00:33:36 +0000)
   Doctor Strange (1970-01-01 00:33:36 +0000)
```

Oooops! Seems like the date parsing does not work. I TOLD you that we would have
fix this. Let's do it.


## Step 8 - Fix date parsing

The problem is that the api uses a different date format than Alamofire expected.
This can be solved by replacing the `DateTransform`. Add a `Date` folder to `Api`
and add this extension to it:

```swift
import ObjectMapper

public extension DateTransform {
    
    public static var custom: DateFormatterTransform {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return DateFormatterTransform(dateFormatter: formatter)
    }
}
```

Now change the `releaseDate` mapping in the `ApiMovie` class to look like this:

```swift
releaseDate <- (map["releaseDate"], DateTransform.custom)
```

Problem solved! The app should now output the following instead:

```
Found 10 movies:
   Finding Dory (2016-06-17 00:00:00 +0000)
   Rouge One - A Star Wars Story (2016-12-16 00:00:00 +0000)
   Captain America - Civil War (2016-05-06 00:00:00 +0000)
   The Secret Life of Pets (2016-07-08 00:00:00 +0000)
   The Jungle Book (2016-04-15 00:00:00 +0000)
   Deadpool (2016-02-12 00:00:00 +0000)
   Zootopia (2016-03-04 00:00:00 +0000)
   Batman v Superman - Dawn of Justice (2016-03-25 00:00:00 +0000)
   Suicide Squad (2016-08-05 00:00:00 +0000)
   Doctor Strange (2016-11-05 00:00:00 +0000)
```

If you inspect the other properties, you will see that they are correctly parsed.
Time to celebrate!...then extend Alamofire with some more powerful functionality.


## Step 9 - Retry failing requests

In the real world, a user most often has to authenticate her/himself in order to
use some parts of an api. Authentication often returns a set of tokens, commonly
an `auth token` and a `refresh token` (but how this works is up to the api).

If the `auth token` and `refresh token` pattern is used, the authentication flow
could look something like this:

 * If no tokens exist and a request fails with an HTTP 401, the user may have to
 login (if the request is mandatory). If so, show a login screen/prompt.
 * If tokens exist, the app should provide the `auth` token with each request.
 * If an `auth` token-based request fails with an HTTP 401, the `auth` token has
 most probably expired. The app should then save any requests that fail with 401
 and use the `refresh` token to request new tokens from the api.
 * If the refresh succeeds, the app should parse the new tokens and retry failed
 requests with these new tokens. The app should use these new tokens from now on.
 * If the refresh request fails, the app should delete all tokens and logout the
 user. If the app requires a logged in user, the app should show a login screen.

Alamofire makes this kind of logic **super simple** to implement, since it has a
`RequestRetrier` protocol that we can implement and inject into Alamofire. It is
automatically notified about every failing request, and lets you determine if it
should be retried or not.

We will demonstrate this by faking a failing request. First, add an `auth` route
to `ApiRoute`, using `auth` as path. When calling our static api, we will always
be given the same "auth token" (it is a STATIC api, see?), but it is good enough
for demo purposes.

Second, add a new `Auth` folder and add this protocol to it:

```swift
typealias AuthResult = (_ token: String?, _ error: Error?) -> ()

protocol AuthService: class {
    
    func authorize(completion: @escaping AuthResult)
}
``` 

This is a very simple protocol that describes how the app authorizes itself. The
app will be able to use this, without having to care about how it is implemented.
Before we implement it, we have to add a way to store any auth tokens we receive.

Remember what I told you about the `ApiContext`? Well, I think it is the PERFECT
place to store api tokens as well, so let's do that. Add an `authToken` property
to the `ApiContext` protocol:

```swift
var authToken: String? { get set }
```

Also, add this property to `NonPersistentApiContext` (if we had a persistent one,
it would remember the token even if restarted the app, but that's something that
you could perhaps try to build yourself as a home assignment):

```swift
var authToken: String?
```

Now, let's create an Alamofire-based `AuthService`. Add an `Auth` folder to `Api`
and add this class to it:


```swift
import Alamofire
import AlamofireObjectMapper

class ApiAuthService: AlamofireService, AuthService {
    
    func authorize(completion: @escaping AuthResult) {
        get(at: .auth).responseString { (response: DataResponse<String>) in
            if let token = response.result.value {
                self.context.authToken = token
            }
            completion(response.result.value, response.result.error)
        }
    }
}
``` 

If the request above succeeds, the token will be saved in our api context, which
makes it available to all future api requests.

Now, let's (finally) retry some requests! Add this to the `Api/Alamofire` folder:

```swift
import Alamofire

class ApiRequestRetrier: RequestRetrier {
    
    
    // MARK: - Initialization
    
    init(context: ApiContext, authService: AuthService, statusCodeTrigger: Int = 404 /* 401 */) {
        self.context = context
        self.authService = authService
        self.statusCodeTrigger = statusCodeTrigger
    }
    
    
    // MARK: - Dependencies
    
    private let authService: AuthService
    private var context: ApiContext
    private let statusCodeTrigger: Int
    
    
    // MARK: - Properties
    private var isAuthorizing = false
    private var retryQueue = [RequestRetryCompletion]()
    
    
    // MARK: - RequestRetrier
    
    func should(
        _ manager: SessionManager,
        retry request: Request,
        with error: Error,
        completion: @escaping RequestRetryCompletion) {
        
        guard
            shouldRetryRequest(with: request.request?.url),
            shouldRetryResponse(with: request.response?.statusCode)
            else { return completion(false, 0) }
        
        authorize(with: completion)
    }
}


// MARK: - Private Functions

private extension ApiRequestRetrier {
    
    func authorize(with completion: @escaping RequestRetryCompletion) {
        print("Authorizing application...")
        retryQueue.append(completion)
        guard !isAuthorizing else { return }
        isAuthorizing = true
        authService.authorize { (token, error) in
            self.isAuthorizing = false
            self.printAuthResult(token, error)
            self.context.authToken = token
            let success = token != nil
            self.retryQueue.forEach { $0(success, 0) }
            self.retryQueue.removeAll()
        }
    }
    
    func printAuthResult(_ token: String?, _ error: Error?) {
        if let error = error {
            return print("Authorizing failed: \(error.localizedDescription)")
        }
        if let token = token {
            return print("Authorizing succeded: \(token)")
        }
        print("No token received - failing!")
    }
    
    func shouldRetryRequest(with url: URL?) -> Bool {
        guard let url = url?.absoluteString else { return false }
        let authPath = ApiRoute.auth.path
        return !url.contains(authPath)
    }
    
    func shouldRetryResponse(with statusCode: Int?) -> Bool {
        return statusCode == statusCodeTrigger
    }
}
```

Whenever a request fails, Alamofire will ask the retrier if it should be retried.
The retrier will trigger a retry if the request is not a failing auth (read more
about the commented out 401 later). If not, it just lets the request fail.

If a request should be retried, it's added it to a retry queue. The retrier then
triggers an authorization. Once it completes, the retrier checks if it succeeded.
If so, all queued requests are retried. If not, they are made to fail. The retry
queue is then cleared.

Note that this is completely hidden from the user as well as the app itself. The
retrier works under the hood, tightly connected to Alamofire's internal workings.
It just notifies the app if the authorization fails, by failing all requests.

Inject the retrier into `Alamofire` by adding the following to our `viewDidLoad`
(note that you have to add `import Alamofire` topmost as well):

```
let manager = SessionManager.default
manager.retrier = ApiRequestRetrier(context: context, authService: authService)
```

**IMPORTANT**  In the real world, a 401 status code is an indication that tokens
should be refreshed. If this refresh fails, a 401 indicates that the user has to
log in, since the tokens are invalid. Here, however, we will never receive a 401,
since we use a static api. We thus have to trigger these mechanisms by doing the
following:

 * Kill your connection and perform a clean install, to remove all stored data.
 * Add a breakpoint to the retrier's `authService.authorizeApplication` call.
 * Run the app. The app should now fail the request and activate this breakpoint.
 * Bring the connection back online and resume the app.
 * This should make the auth request succeed and have Alamofire retry the request.

That's it! Alamofire should now retry any failing request that are not auth ones.


## Step 10 - Adapt all api requests

Sometimes, you have to add custom headers to every request you make to an api. A
common scenario is to add `Accept` information, auth tokens etc.

To adapt all requests before they are sent by an app, you just have to implement
the Alamofire `RequestAdapter` protocol and inject it into Alamofire. Let's give
it a try! Add this file to the `Api/Alamofire` folder:

```swift
import Alamofire

class ApiRequestAdapter: RequestAdapter {
    
    public init(context: ApiContext) {
        self.context = context
    }
    
    private let context: ApiContext
    
    func adapt(_ request: URLRequest) throws -> URLRequest {
        guard let token = context.authToken else { return request }
        var request = request
        request.setValue(token, forHTTPHeaderField: "AUTH_TOKEN")
        return request
    }
}
```

As you can see, this adapter just adds any existing token to the request headers.
Inject it into `Alamofire` by adding the following to our `viewDidLoad`:

```swift
manager.adapter = ApiRequestAdapter(context: context)
```

That's it! Alamofire should now add the auth token to all requests, if it exists.


## Adding offline support with Realm

We will now add offline support to our app, so that we can still fetch data when
we are offline. There are a million ways to do this, but we will do it by adding
Realm to our app and build a new services that stores movies to a local database.

When we create this new service, we will use the *decorator pattern*, where this
new service will use a *base service* to fetch data, then add the database logic
on top of this. The decorator pattern is great when you want to compose services
together and let each service only be responsible for its own scope. It makes it
very easy to test each service and provides you with a flexible, composable code
base, where you can use as many implememtations as you need.


## Step 11 - Add Realm support

Before we can start to create a Realm-specific implementation of our service and
domain model, we have to add Realm support to our app.

To do this, just add `RealmSwift` to `podfile` and run `pod install`. When Realm
has been installed, we can create proceed with creating a Realm-specific model.


## Step 12 - Create a Realm-specific model

Unlike the old Swift 3 implementation of this app, I no longer use protocols for
the domain model. Instead, I use structs that I map between.

As such, the Realm-specific model will not inherit any other class nor implement
any model protols. Instead, it will just define the properties it needs, as well
as add some mapping functions.

Create a new `Realm` folder in the app root and these two Realm classes to it:

```swift 
import RealmSwift

class RealmMovieActor: Object {
    
    convenience init(from actor: MovieActor) {
        self.init()
        self.name = actor.name
    }
    
    @objc dynamic var name = ""
    
    func convert() -> MovieActor {
        return MovieActor(name: name)
    }
}
```

```swift
import RealmSwift

class RealmMovie: Object {
    
    // MARK: - Initialization
    
    convenience init(from: Movie) {
        self.init()
        self.id = from.id
        self.name = from.name
        self.year = from.year
        self.releaseDate = from.releaseDate
        self.grossing = from.grossing
        self.rating = from.rating
        from.cast
            .map { RealmMovieActor(from: $0) }
            .forEach { self.cast.append($0) }
    }
    
    
    // MARK: - Properties
    
    @objc dynamic var id = 0
    @objc dynamic var name = ""
    @objc dynamic var year = 0
    @objc dynamic var releaseDate = Date(timeIntervalSince1970: 0)
    @objc dynamic var grossing = 0
    @objc dynamic var rating = 0.0
    let cast = List<RealmMovieActor>()
    
    
    // MARK: - Primary Key
    
    override class func primaryKey() -> String? {
        return "id"
    }
    
    
    // MARK: - Functions
    
    func convert() -> Movie {
        return Movie(
            id: id,
            name: name,
            year: year,
            releaseDate: releaseDate,
            grossing: grossing,
            rating: rating,
            cast: cast.map { $0.convert() }
        )
    }
}
```

As you can see, just as the api-specific models, these are regular Realm objects
that can be mapped to our domain model structs. Both inherit the `Realm` `Object`
class and have a convenience initializer that copies a domain model instance, as
will be needed as we now create our Realm-based movie service.


## Step 12 - Create a Realm-specific movie service

Now let's add a Realm-specific movie service that lets us store movies and movie
actors from the api into Realm. Add this file to the `Realm` folder:

```swift
import RealmSwift

class RealmMovieService: MovieService {

    
    // MARK: - Initialization
    
    init(baseService: MovieService) {
        self.baseService = baseService
    }
    
    
    // MARK: - Dependencies
    
    private let baseService: MovieService
    private var realm: Realm { return try! Realm() }
    
    
    // MARK: - Functions
    
    func getMovie(id: Int, completion: @escaping MovieResult) {
        getMovieFromDb(id: id, completion: completion)
        getMovieFromBaseService(id: id, completion: completion)
    }
    
    func getTopGrossingMovies(year: Int, completion: @escaping MoviesResult) {
        getTopGrossingMoviesFromDb(year: year, completion: completion)
        getTopGrossingMoviesFromBaseService(year: year, completion: completion)
    }
    
    func getTopRatedMovies(year: Int, completion: @escaping MoviesResult) {
        getTopRatedMoviesFromDb(year: year, completion: completion)
        getTopRatedMoviesFromBaseService(year: year, completion: completion)
    }
}


// MARK: - Database Functions

private extension RealmMovieService {
    
    func getMovieFromDb(id: Int, completion: @escaping MovieResult) {
        let obj = realm.object(ofType: RealmMovie.self, forPrimaryKey: id)
        guard let movie = obj?.convert() else { return }
        completion(movie, nil)
    }
    
    func getTopGrossingMoviesFromDb(year: Int, completion: @escaping MoviesResult) {
        let objs = realm.objects(RealmMovie.self).filter("year == \(year)")
        let sorted = objs.sorted { $0.grossing > $1.grossing }.map { $0.convert() }
        completion(sorted, nil)
    }
    
    func getTopRatedMoviesFromDb(year: Int, completion: @escaping MoviesResult) {
        let objs = realm.objects(RealmMovie.self).filter("year == \(year)")
        let sorted = objs.sorted { $0.rating > $1.rating }.map { $0.convert() }
        completion(sorted, nil)
    }
    
    func persist(_ movie: Movie?) {
        persist([movie].compactMap { $0 })
    }
    
    func persist(_ movies: [Movie]) {
        let objs = movies.map { RealmMovie(from: $0) }
        try! realm.write {
            realm.add(objs, update: true)
        }
    }
}


// MARK: - Base Service Functions

private extension RealmMovieService {
    
    func getMovieFromBaseService(id: Int, completion: @escaping MovieResult) {
        baseService.getMovie(id: id) { [weak self] (movie, error) in
            self?.persist(movie)
            completion(movie, error)
        }
    }
    
    func getTopGrossingMoviesFromBaseService(year: Int, completion: @escaping MoviesResult) {
        baseService.getTopGrossingMovies(year: year) { [weak self] (movies, error) in
            self?.persist(movies)
            completion(movies, error)
        }
    }
    
    func getTopRatedMoviesFromBaseService(year: Int, completion: @escaping MoviesResult) {
        baseService.getTopRatedMovies(year: year) { [weak self] (movies, error) in
            self?.persist(movies)
            completion(movies, error)
        }
    }
}
```

As you can see, `RealmMovieService`'s initializer requires another `MovieService`
instance, as I described earlier. This is the decorator pattern in action, where
`RealmMovieService` is a so called `decorator`, that uses another implementation
of the same a protocol it implements, to extend the base implementation with its
on logic. In this case, our `baseService` is an `AlamofireMovieService`, but the
decorator mustn't know anything about the base service's internal workings, only
what the protocol promises.

In this case, `RealmMovieService` will try to get data from the database, but at
the same time, it will also try to get data from the base service. When the base
service completes, `RealmMovieService` saves any data it receives. It then calls
the incoming completion block to notify its caller about the new data.

`Disclaimer:` This is an intentionally simple design. `RealmMovieService` always
loads data from the database **and** from the base service. In a real app, you'd
probably have some logic to determine if calling the base service is needed.


## Step 13 - Put Realm into action

Let's give the new movie service a try. Modify `viewDidLoad` to look like this:

```swift
override func viewDidLoad() {
    super.viewDidLoad()
    let env = ApiEnvironment.production
    let context = NonPersistentApiContext(environment: env)
    let baseService = AlamofireMovieService(context: context)
    let service = RealmMovieService(baseService: baseService)
    var invokeCount = 0
    service.getTopGrossingMovies(year: 2016) { (movies, error) in
        invokeCount += 1
        if let error = error { return print(error.localizedDescription) }
        print("Found \(movies.count) movies (callback #\(invokeCount))")
    }
}
```

As you can see, we have renamed the `AlamofireMovieService` to `baseService` and
created a new `RealmMovieService` instance into which we inject the `baseService`.
The app is still loading top grossing movies using a `service`, but the instance
will now first check the database then call the api. However, the most important
thing here is that the app doesn't care about any of this. Just as the decorator
doesn't care about the internal workings of its base service, the app only cares
about the protocol, not the implementation (in the code above, it actually knows
about the implementation, but we'll fix that later).

The output will be the following, the first time we run the app with this setup:

```
Found 0 movies  (callback #1)
Found 10 movies (callback #2)
```

This happens because the database has no data, while the api will load 10 movies.
If you run the app again, the output should be:

```
Found 10 movies (callback #1)
Found 10 movies (callback #2)
```

This happens because the database now has data, which means that both completion
calls will return 10 movies.

Now bring the app offline and call `getTopRatedMovies` instead (Alamofire caches
the previous result, so we have to fetch previously unfetched data). If you then
run the app again, the output should be:

```
Found 10 movies (callback #1)
ERROR: The Internet connection appears to be offline.
```

This happens because the database data can still be loaded, while the api cannot
be called since the Internet connection is dead.

We now have an app with offline support, that only refreshes its data whenever a
call to the api provides new data. All we had to do was to change two lines that
determines which service implementation we use.


## Step 14 - Add Dependency Injection to the app

Well, I won't show the specifics here, since it just add even more complexity to
an already long post. In the demo app, however, I have an `IoC` folder, in which
I use a library called [Dip]({{page.dip}}) to register and resolve dependencies. 

By adding `Dip` to `podfile` and running `pod install`, we can make the app much
cleaner and much more robust, since we'll register all dependencies when the app
launches, then resolves any dependencies either with *constructor injection*, or
by calling `IoC.resolve(...)`, which is required if you use storyboards.

Take a look at the demo app if you are interested in the specifics. In short, it
will let us remove a lot of code from our view controller, which setup then will
just look like this:

```swift
import UIKit
import Alamofire

class ViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        reloadData(self)
    }
    
    lazy var movieService: MovieService = IoC.resolve()
    
    ...
}
```

With dependency injection in place, the app no longer knows anything about which
implementations we use. The only part of the app that now knows about the api, a
database etc. is the `IoC` folder, where everything is registered. This makes it
very easy to change implementations later on, since we just have to register the
new implementations at one single place.


## Conclusion

Well done! You have created an app that uses Alamofire to fetch data from an api.
It also injects a `RequestRetrier` and a `RequestAdapter` to Alamofire to change
how it adapts all outgoing requests and handles any failing ones. Very nice!

I hope this was helpful. Do not hesistate to throw your thoughts and ideas at me.
You can comment here or @ me on [Twitter]({{page.twitter}}).